"""FastAPI application for ACAFS Service."""

import asyncio
import signal
import sys
from contextlib import asynccontextmanager
from threading import Thread
from typing import AsyncGenerator
from uuid import UUID

from fastapi import APIRouter, FastAPI, HTTPException, status
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.logging_config import configure_logging, get_logger
from app.schemas import (
    ChatHistoryResponse,
    ChatMessageResponse,
    ChatRequest,
    ChatResponse,
    SubmissionEvent,
)
from app.services.feedback.socratic_chat import SocraticChatService
from app.services.messaging.rabbitmq_consumer import RabbitMQConsumer
from app.services.storage.minio_client import MinIOClient
from app.services.storage.postgres_client import PostgresClient
from app.workers.eval_worker import EvaluationWorker

logger = get_logger(__name__)

# Global state
consumer: RabbitMQConsumer | None = None
worker: EvaluationWorker | None = None
postgres_client: PostgresClient | None = None
chat_service: SocraticChatService | None = None


async def process_message(event: SubmissionEvent) -> None:
    """Process a submission event from RabbitMQ.
    
    Args:
        event: Submission event
    """
    if worker:
        await worker.process_event(event)


def run_consumer(loop: asyncio.AbstractEventLoop) -> None:
    """Run RabbitMQ consumer in a separate thread.

    Dispatches events to the *existing* FastAPI event loop via
    run_coroutine_threadsafe so the asyncpg connection pool (initialised in
    that loop) is always accessed from its own loop.

    asyncio.run() must NOT be used here — it creates a brand-new event loop
    that has no knowledge of the pool's internal futures, which produces
    'cannot perform operation: another operation is in progress' errors.
    """
    global consumer
    settings = get_settings()

    def handle_event(event: SubmissionEvent) -> None:
        """Bridge: schedule coroutine on the main loop and wait for result."""
        future = asyncio.run_coroutine_threadsafe(process_message(event), loop)
        try:
            # Block the pika I/O thread until processing completes so that
            # basic_ack / basic_nack is sent only after the work is done.
            future.result(timeout=300)
        except Exception as e:
            logger.error("consumer_event_dispatch_failed", error=str(e))

    consumer = RabbitMQConsumer(
        settings=settings,
        message_handler=handle_event,
    )

    try:
        consumer.start()
    except Exception as e:
        logger.error("consumer_thread_error", error=str(e))


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator:
    """Application lifespan manager.
    
    Handles startup and shutdown events.
    """
    global worker, postgres_client, chat_service
    
    # Startup
    settings = get_settings()
    configure_logging(settings.log_level, settings.environment)
    
    logger.info(
        "acafs_service_starting",
        service=settings.service_name,
        version="0.1.0",
        environment=settings.environment,
    )
    
    # Initialize PostgreSQL client
    postgres_client = PostgresClient(settings.database_dsn)
    await postgres_client.connect()
    await postgres_client.ensure_tables()
    
    # Initialize MinIO client
    minio_client = MinIOClient(
        endpoint=settings.minio_endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        bucket_name=settings.minio_bucket,
        use_ssl=settings.minio_use_ssl,
    )
    
    # Initialize evaluation worker (includes LLM grader + Judge0 client)
    worker = EvaluationWorker(
        settings=settings,
        minio_client=minio_client,
        postgres_client=postgres_client,
    )

    # Initialize Socratic chat service
    chat_service = SocraticChatService(settings=settings)
    
    # Start RabbitMQ consumer in background thread.
    # Pass the running event loop so the consumer dispatches coroutines onto
    # the same loop that owns the asyncpg pool.
    loop = asyncio.get_event_loop()
    consumer_thread = Thread(target=run_consumer, args=(loop,), daemon=True)
    consumer_thread.start()
    
    logger.info("acafs_service_ready")
    
    yield
    
    # Shutdown
    logger.info("acafs_service_shutting_down")
    
    if consumer:
        consumer.stop()
    
    if worker:
        worker.close()
    
    if postgres_client:
        await postgres_client.close()
    
    logger.info("acafs_service_shutdown_complete")


# Load settings early for use in route handlers
settings = get_settings()


# Create API router with prefix
api_router = APIRouter(prefix="/api/v1/acafs")


@api_router.get("/health", tags=["health"])
async def health_check() -> JSONResponse:
    """Health check endpoint.
    
    Returns:
        Health status response
    """
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "status": "healthy",
            "service": settings.service_name,
            "version": "0.1.0",
        },
    )


@api_router.get("/ready", tags=["health"])
async def readiness_check() -> JSONResponse:
    """Readiness check endpoint.
    
    Returns:
        Readiness status response
    """
    healthy = True
    checks = {}
    
    # Check PostgreSQL
    if postgres_client:
        try:
            # Simple connectivity check
            checks["postgres"] = "ok"
        except Exception as e:
            healthy = False
            checks["postgres"] = f"error: {e}"
    else:
        healthy = False
        checks["postgres"] = "not_initialized"
    
    # Check consumer
    if consumer:
        checks["rabbitmq_consumer"] = "running"
    else:
        healthy = False
        checks["rabbitmq_consumer"] = "not_running"
    
    status_code = status.HTTP_200_OK if healthy else status.HTTP_503_SERVICE_UNAVAILABLE
    
    return JSONResponse(
        status_code=status_code,
        content={
            "status": "ready" if healthy else "not_ready",
            "checks": checks,
        },
    )


@api_router.get("/metrics", tags=["observability"])
async def metrics() -> JSONResponse:
    """Metrics endpoint for monitoring.
    
    Returns:
        Basic metrics response
    """
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "service": settings.service_name,
            "version": "0.1.0",
            # TODO: Add actual metrics (processed count, error rate, etc.)
        },
    )


@api_router.get("/languages", tags=["info"])
async def supported_languages() -> JSONResponse:
    """Get list of supported programming languages.
    
    Returns:
        List of supported languages
    """
    from app.services.evaluation.language_router import LanguageRouter
    
    router = LanguageRouter()
    languages = router.get_supported_languages()
    
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "languages": languages,
            "count": len(languages),
        },
    )


# ═══════════════════════════════════════════════════════════════════════════════
# Socratic Chat API  (session scoped to assignment + student)
# ═══════════════════════════════════════════════════════════════════════════════

@api_router.post(
    "/chat/{assignment_id}/{user_id}",
    tags=["chat"],
    response_model=ChatResponse,
    summary="Send a message to the Socratic tutor",
    description=(
        "Creates an active chat session if one does not already exist for this "
        "assignment+student pair.  The session is automatically closed when the "
        "student's submission event is processed."
    ),
)
async def send_chat_message(
    assignment_id: UUID,
    user_id: str,
    body: ChatRequest,
) -> ChatResponse:
    """Send a student message and receive a Socratic hint."""
    if postgres_client is None or chat_service is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Service not ready.",
        )

    # 1. Get or create the active session
    session = await postgres_client.get_or_create_chat_session(
        assignment_id=assignment_id,
        user_id=user_id,
    )

    if session["status"] != "active":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Chat session is closed (submission already processed). "
                "No further messages are accepted for this assignment."
            ),
        )

    session_uuid = UUID(session["id"])

    # 2. Persist student message
    await postgres_client.append_chat_message(
        session_id=session_uuid,
        role="user",
        content=body.content,
    )

    # 3. Retrieve full history for context window
    raw_messages = await postgres_client.get_chat_messages(session_uuid)
    history = [{"role": m["role"], "content": m["content"]} for m in raw_messages]

    # 4. Build assignment and AST context dicts
    assignment_ctx: dict = {}
    if body.assignment_title:
        assignment_ctx["title"] = body.assignment_title
    if body.assignment_description:
        assignment_ctx["assignment_description"] = body.assignment_description
    if body.rubric_skills:
        assignment_ctx["rubric_skills"] = body.rubric_skills
    if body.answer_concepts:
        assignment_ctx["answer_concepts"] = body.answer_concepts

    ast_ctx: dict | None = None
    if body.ast_context:
        ast_ctx = body.ast_context
    elif body.student_code:
        # Build a lightweight snapshot from the current code snapshot
        try:
            from app.services.evaluation.ast_parser import ASTParser
            from app.services.evaluation.language_router import LanguageRouter
            parser_inst = ASTParser()
            blueprint = parser_inst.parse(code=body.student_code, language="python")
            ast_ctx = {
                "valid_syntax": True,
                "variables": [
                    v.get("name", "") for v in blueprint.variables[:10]
                ],
                "functions": blueprint.functions[:5],
            }
        except Exception:
            pass

    # 5. Call Socratic tutor
    reply_content, reasoning = await chat_service.get_hint(
        messages=history,
        assignment_context=assignment_ctx or None,
        ast_context=ast_ctx,
    )

    # 6. Persist assistant reply
    await postgres_client.append_chat_message(
        session_id=session_uuid,
        role="assistant",
        content=reply_content,
        reasoning_details=reasoning,
    )

    # 7. Return full updated history
    updated_messages = await postgres_client.get_chat_messages(session_uuid)
    return ChatResponse(
        session_id=session_uuid,
        assignment_id=assignment_id,
        user_id=user_id,
        status=session["status"],
        reply=reply_content,
        messages=[
            ChatMessageResponse(
                id=m["id"],
                role=m["role"],
                content=m["content"],
                created_at=m.get("created_at"),
            )
            for m in updated_messages
        ],
    )


@api_router.get(
    "/chat/{assignment_id}/{user_id}",
    tags=["chat"],
    response_model=ChatHistoryResponse,
    summary="Get chat session history",
    description=(
        "Returns the most recent chat session (active or closed) for this "
        "assignment+student pair, including all messages.  Useful for UI "
        "restore and instructor analytics."
    ),
)
async def get_chat_history(
    assignment_id: UUID,
    user_id: str,
) -> ChatHistoryResponse:
    """Retrieve the chat session transcript for a student and assignment."""
    if postgres_client is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Service not ready.",
        )

    session = await postgres_client.get_chat_session(
        assignment_id=assignment_id,
        user_id=user_id,
    )
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No chat session found for this assignment and student.",
        )

    session_uuid = UUID(session["id"])
    messages = await postgres_client.get_chat_messages(session_uuid)

    return ChatHistoryResponse(
        session_id=session_uuid,
        assignment_id=assignment_id,
        user_id=user_id,
        status=session["status"],
        created_at=session.get("created_at"),
        closed_at=session.get("closed_at"),
        closed_reason=session.get("closed_reason"),
        messages=[
            ChatMessageResponse(
                id=m["id"],
                role=m["role"],
                content=m["content"],
                created_at=m.get("created_at"),
            )
            for m in messages
        ],
    )


# ═══════════════════════════════════════════════════════════════════════════════
# Grade retrieval API  (read-only — grades are written by the worker)
# ═══════════════════════════════════════════════════════════════════════════════

@api_router.get(
    "/grades/{submission_id}",
    tags=["grades"],
    summary="Get grade breakdown for a submission",
    description=(
        "Returns the full grading result including per-criterion scores with "
        "instructor-facing reasons and the student-facing holistic feedback paragraph."
    ),
)
async def get_submission_grade(submission_id: UUID) -> JSONResponse:
    """Retrieve the persisted grade breakdown for a submission."""
    if postgres_client is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Service not ready.",
        )

    grade = await postgres_client.get_submission_grade(submission_id)
    if not grade:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Grade not found. The submission may still be processing.",
        )

    return JSONResponse(status_code=status.HTTP_200_OK, content=grade)


def signal_handler(sig, frame) -> None:
    """Handle shutdown signals gracefully."""
    logger.info("shutdown_signal_received", signal=sig)
    sys.exit(0)


# Create FastAPI app
app = FastAPI(
    title="ACAFS Service",
    description="Automated Code Analysis & Feedback System Engine for Gradeloop",
    version="0.1.0",
    lifespan=lifespan,
)

# Include API router
app.include_router(api_router)

# Register signal handlers
signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)


if __name__ == "__main__":
    import uvicorn
    
    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host=settings.service_host,
        port=settings.service_port,
        log_level=settings.log_level.lower(),
        reload=settings.environment == "development",
    )
