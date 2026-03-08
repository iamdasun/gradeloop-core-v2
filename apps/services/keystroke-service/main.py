"""
Keystroke Dynamics Authentication Service
FastAPI microservice for behavioral biometrics
"""

import asyncio
import json
from typing import Dict, List, Optional

import pika
from behavioral_analysis import (
    BehavioralAnalyzer,
    KeystrokeSessionEvent,
    format_analysis_report,
)

# Import new clients
from db import get_db_client
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from feature_extraction import KeystrokeFeatureExtractor
from pydantic import BaseModel
from redis_client import get_redis_client
from typenet_inference import TypeNetAuthenticator

# Initialize FastAPI app
app = FastAPI(
    title="Keystroke Dynamics Authentication API",
    description="Behavioral biometrics API for continuous student authentication",
    version="1.0.0",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global instances
feature_extractor = KeystrokeFeatureExtractor()

# TypeNet model path
typenet_model_path = os.path.join(
    os.path.dirname(__file__), "models", "typenet_pretrained.pth"
)
typenet_template_path = os.path.join(
    os.path.dirname(__file__), "models", "user_templates.pkl"
)

# Initialize TypeNet authenticator
authenticator = TypeNetAuthenticator(
    model_path=typenet_model_path if os.path.exists(typenet_model_path) else None,
    device="cpu",  # Change to 'cuda' if GPU available
)

# Load user templates if available
if os.path.exists(typenet_template_path):
    try:
        authenticator.load_templates(typenet_template_path)
        print(
            f"✅ Loaded {len(authenticator.user_templates)} user templates from TypeNet"
        )
    except Exception as e:
        print(f"⚠️  Failed to load user templates: {e}")
else:
    print("ℹ️  No user templates found. Users need to be enrolled.")
    print("   Use /api/keystroke/enroll endpoint to enroll users.")

# Initialize behavioral analyzer (Gemini API key optional — loaded from env)
behavioral_analyzer = BehavioralAnalyzer()

# Initialize database and Redis clients
db_client = get_db_client()
redis_client = get_redis_client()

# Load user templates from database (fallback to pickle if database not available)
if db_client.enabled:
    try:
        all_templates = db_client.load_all_templates()
        # Convert multi-phase templates to TypeNet format (use all phases)
        for user_id, phases in all_templates.items():
            if phases:
                # Use the most recent phase or aggregate all phases
                # For simplicity, use the first available phase template
                first_phase = list(phases.values())[0]
                authenticator.user_templates[user_id] = first_phase
        print(
            f"✅ Loaded {len(authenticator.user_templates)} user templates from database"
        )
    except Exception as e:
        print(f"⚠️  Failed to load templates from database: {e}")
        # Fallback to pickle
        if os.path.exists(typenet_template_path):
            try:
                authenticator.load_templates(typenet_template_path)
                print(
                    f"✅ Loaded {len(authenticator.user_templates)} user templates from pickle (fallback)"
                )
            except Exception as e2:
                print(f"⚠️  Failed to load pickle templates: {e2}")
elif os.path.exists(typenet_template_path):
    # Database not enabled, use pickle
    try:
        authenticator.load_templates(typenet_template_path)
        print(
            f"✅ Loaded {len(authenticator.user_templates)} user templates from pickle"
        )
    except Exception as e:
        print(f"⚠️  Failed to load user templates: {e}")
else:
    print("ℹ️  No user templates found. Users need to be enrolled.")
    print("   Use /api/keystroke/enroll endpoints to enroll users.")

# Session TTL from environment (default 2 hours)
SESSION_TTL_SECONDS = int(os.getenv("SESSION_TTL_HOURS", "2")) * 3600

# RabbitMQ Configuration
RABBITMQ_HOST = os.getenv("RABBITMQ_HOST", "localhost")
RABBITMQ_EXCHANGE = "keystroke.exchange"
RABBITMQ_ROUTING_KEY = "keystroke.auth.result"


def publish_auth_event(event_data: dict):
    """Publish authentication event to RabbitMQ"""
    try:
        connection = pika.BlockingConnection(
            pika.ConnectionParameters(host=RABBITMQ_HOST)
        )
        channel = connection.channel()

        # Declare exchange
        channel.exchange_declare(
            exchange=RABBITMQ_EXCHANGE, exchange_type="topic", durable=True
        )

        # Publish message
        channel.basic_publish(
            exchange=RABBITMQ_EXCHANGE,
            routing_key=RABBITMQ_ROUTING_KEY,
            body=json.dumps(event_data),
            properties=pika.BasicProperties(
                content_type="application/json",
                delivery_mode=2,  # Make message persistent
            ),
        )

        connection.close()
        print(
            f"✅ Published auth event to RabbitMQ for student: {event_data.get('studentId')}"
        )
    except Exception as e:
        print(f"⚠️ Failed to publish to RabbitMQ: {e}")
        # Don't fail the request if RabbitMQ publish fails


# In-memory phase tracking (used when database is disabled as fallback)
_in_memory_phases: Dict[str, set] = {}
REQUIRED_PHASES = {"baseline", "transcription", "stress", "cognitive"}

# ==================== Pydantic Models ====================


class KeystrokeEvent(BaseModel):
    userId: str
    sessionId: str
    timestamp: int
    key: str
    dwellTime: int
    flightTime: int
    keyCode: int


class KeystrokeBatch(BaseModel):
    events: List[KeystrokeEvent]


class EnrollmentRequest(BaseModel):
    userId: str
    keystrokeEvents: List[Dict]


class VerificationRequest(BaseModel):
    userId: str
    keystrokeEvents: List[Dict]
    threshold: Optional[float] = 0.7
    assignmentId: Optional[str] = None
    courseId: Optional[str] = None


class IdentificationRequest(BaseModel):
    keystrokeEvents: List[Dict]
    topK: Optional[int] = 3


class BehavioralAnalysisRequest(BaseModel):
    sessionId: str
    studentId: str
    events: List[Dict]
    finalCode: str
    includeReport: Optional[bool] = False


class MonitoringRequest(BaseModel):
    userId: str
    sessionId: str
    assignmentId: Optional[str] = None
    courseId: Optional[str] = None


# ==================== Health Check ====================


@app.get("/health")
async def health_check():
    """Health check endpoint for container orchestration"""
    return {
        "status": "healthy",
        "service": "keystroke-service",
        "version": "1.0.0",
        "infrastructure": {
            "database": "connected" if db_client.enabled else "disabled",
            "redis": "connected" if redis_client.health_check() else "disconnected",
            "rabbitmq": RABBITMQ_HOST,
        },
    }


@app.get("/")
async def root():
    return {
        "service": "Keystroke Dynamics Authentication",
        "status": "running",
        "version": "1.0.0",
        "endpoints": {
            "capture": "/api/keystroke/capture",
            "enroll": "/api/keystroke/enroll",
            "enroll_phase": "/api/keystroke/enroll/phase",
            "enrollment_progress": "/api/keystroke/enroll/progress/{user_id}",
            "verify": "/api/keystroke/verify",
            "identify": "/api/keystroke/identify",
            "monitor": "/api/keystroke/monitor",
            "timeline": "/api/keystroke/timeline/{session_id}",
            "finalize": "/api/keystroke/session/finalize",
            "archive": "/api/keystroke/archive/{session_id}",
            "enrolled_users": "/api/keystroke/users/enrolled",
        },
    }


# ==================== API Endpoints ====================


@app.post("/api/keystroke/capture")
async def capture_keystrokes(batch: KeystrokeBatch):
    """
    Capture keystroke events from frontend
    Store in Redis session buffer for continuous monitoring
    """
    try:
        events = [event.dict() for event in batch.events]

        if not events:
            raise HTTPException(status_code=400, detail="No events provided")

        user_id = events[0]["userId"]
        session_id = events[0]["sessionId"]

        # Create session in Redis if doesn't exist
        if not redis_client.session_exists(user_id, session_id):
            redis_client.create_session(
                user_id,
                session_id,
                {
                    "assignment_id": events[0].get("assignmentId"),
                    "course_id": events[0].get("courseId"),
                },
            )

        # Append events to Redis (circular buffer with max 500)
        total_buffered = redis_client.append_events(
            user_id, session_id, events, max_buffer=500
        )

        return {
            "success": True,
            "captured": len(events),
            "total_buffered": total_buffered,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/keystroke/enroll")
async def enroll_user(request: EnrollmentRequest):
    """
    Enroll a user by creating a behavioral biometric template
    Saves template to PostgreSQL (persistent) and memory (fast lookup)
    """
    try:
        user_id = request.userId
        all_events = request.keystrokeEvents
        phase = getattr(request, "phase", "baseline")

        if len(all_events) < 150:
            raise HTTPException(
                status_code=400,
                detail="Insufficient data for enrollment. Please provide at least 150 keystroke events.",
            )

        # Split events into sequences for TypeNet (70 keystrokes each with 50% overlap)
        sequence_length = 70
        sequences = []
        for i in range(0, len(all_events) - sequence_length, sequence_length // 2):
            sequence_events = all_events[i : i + sequence_length]
            sequence = feature_extractor.create_typenet_sequence(
                sequence_events, sequence_length
            )
            sequences.append(sequence)

        if len(sequences) < 3:
            raise HTTPException(
                status_code=400,
                detail="Could not create enough sequences. Please provide more data.",
            )

        # Enroll user (in-memory)
        result = authenticator.enroll_user(user_id, sequences)

        # Persist to PostgreSQL (primary storage)
        if db_client.enabled and result.get("success"):
            template = authenticator.user_templates[user_id]["template"]
            template_std = authenticator.user_templates[user_id].get("std")
            sample_count = authenticator.user_templates[user_id].get(
                "sample_count", len(sequences)
            )
            db_client.save_template(
                user_id, phase, template, template_std, sample_count
            )
            db_client.update_enrollment_progress(user_id, phase)
        else:
            # Fallback: save to pickle file and track phase in-memory
            authenticator.save_templates(typenet_template_path)
            _in_memory_phases.setdefault(user_id, set()).add(phase)

        return {
            "success": True,
            "user_id": user_id,
            "phase": phase,
            "sequences_created": len(sequences),
            "enrollment_complete": True,
            "message": "User enrolled successfully. Authentication is now active.",
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/keystroke/enroll/progress/{user_id}")
async def get_enrollment_progress(user_id: str):
    """Get multi-phase enrollment progress for a user"""
    try:
        if not db_client.enabled:
            # Use in-memory phase tracker (populated by /enroll and /enroll/phase)
            completed = _in_memory_phases.get(user_id, set())
            enrollment_complete = completed >= REQUIRED_PHASES
            return {
                "success": True,
                "user_id": user_id,
                "enrollment_complete": enrollment_complete,
                "phases_complete": sorted(list(completed)),
                "phases_remaining": sorted(list(REQUIRED_PHASES - completed)),
                "database_enabled": False,
                "message": "Database not enabled - tracking phases in memory",
            }

        progress = db_client.get_enrollment_progress(user_id)
        if not progress:
            return {
                "success": True,
                "user_id": user_id,
                "enrollment_complete": False,
                "phases_complete": [],
                "phases_remaining": [
                    "baseline",
                    "transcription",
                    "stress",
                    "cognitive",
                ],
                "message": "No enrollment data found - start enrollment",
            }

        phases = ["baseline", "transcription", "stress", "cognitive"]
        phases_complete = [p for p in phases if progress.get(f"{p}_complete")]

        return {
            "success": True,
            "user_id": user_id,
            "enrollment_complete": progress.get("enrollment_complete", False),
            "phases_complete": phases_complete,
            "phases_remaining": [p for p in phases if p not in phases_complete],
            "total_sessions": progress.get("total_sessions", 0),
            "started_at": progress.get("started_at").isoformat()
            if progress.get("started_at")
            else None,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/keystroke/enroll/phase")
async def enroll_phase(request: Dict):
    """
    Submit enrollment data for a specific phase
    Supports multi-condition stress-robust enrollment
    """
    try:
        user_id = request.get("userId")
        phase = request.get("phase", "baseline")
        all_events = request.get("keystrokeEvents", [])

        valid_phases = ["baseline", "transcription", "stress", "cognitive"]
        if phase not in valid_phases:
            raise HTTPException(
                status_code=400, detail=f"Invalid phase. Must be one of: {valid_phases}"
            )

        if not user_id:
            raise HTTPException(status_code=400, detail="userId is required")

        if len(all_events) < 150:
            raise HTTPException(
                status_code=400, detail="Insufficient data for phase enrollment"
            )

        # Convert dict events to EnrollmentEvent if needed
        events = [e.dict() if hasattr(e, "dict") else e for e in all_events]

        # Create sequences
        sequence_length = 70
        sequences = []
        for i in range(0, len(events) - sequence_length, sequence_length // 2):
            seq = feature_extractor.create_typenet_sequence(
                events[i : i + sequence_length], sequence_length
            )
            sequences.append(seq)

        if len(sequences) < 3:
            raise HTTPException(
                status_code=400, detail="Could not create enough sequences"
            )

        # Enroll user for this phase
        result = authenticator.enroll_user(user_id, sequences)

        # Save phase-specific template to database
        if db_client.enabled and result.get("success"):
            template = authenticator.user_templates[user_id]["template"]
            template_std = authenticator.user_templates[user_id].get("std")
            db_client.save_template(
                user_id,
                phase,
                template,
                template_std,
                len(sequences),
                metadata=request.get("metadata"),
            )
            db_client.update_enrollment_progress(user_id, phase)

            # Check enrollment completion status
            progress = db_client.get_enrollment_progress(user_id)
            enrollment_complete = progress and progress.get(
                "enrollment_complete", False
            )
        else:
            authenticator.save_templates(typenet_template_path)
            _in_memory_phases.setdefault(user_id, set()).add(phase)
            enrollment_complete = (
                _in_memory_phases.get(user_id, set()) >= REQUIRED_PHASES
            )

        return {
            "success": True,
            "user_id": user_id,
            "phase": phase,
            "sequences_created": len(sequences),
            "enrollment_complete": enrollment_complete,
            "message": f"Phase '{phase}' enrollment successful",
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/keystroke/verify")
async def verify_user(request: VerificationRequest):
    """
    Verify a user's identity based on their keystroke pattern
    Returns authentication status and risk score
    """
    try:
        user_id = request.userId
        events = request.keystrokeEvents
        threshold = request.threshold

        if len(events) < 70:
            raise HTTPException(
                status_code=400,
                detail="Insufficient data for verification. Need at least 70 keystrokes.",
            )

        # Create sequence for TypeNet
        sequence = feature_extractor.create_typenet_sequence(events, sequence_length=70)

        # Verify
        result = authenticator.verify_user(user_id, sequence, threshold)

        # Publish auth event to RabbitMQ
        auth_event = {
            "studentId": user_id,
            "assignmentId": request.assignmentId,
            "courseId": request.courseId,
            "sessionId": None,
            "confidenceLevel": result.get("similarity", 0)
            * 100,  # Convert to percentage
            "riskScore": result.get("risk_score", 0) * 100,  # Convert to percentage
            "keystrokeSampleSize": len(events),
            "timestamp": datetime.now().isoformat(),
            "authenticated": result.get("authenticated", False),
            "similarityScore": result.get("similarity", 0) * 100,
            "metadata": json.dumps({"threshold": threshold}),
        }
        publish_auth_event(auth_event)

        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/keystroke/identify")
async def identify_user(request: IdentificationRequest):
    """
    Identify a user by comparing their keystroke pattern against all enrolled users
    Returns top K matching users with confidence scores
    """
    try:
        events = request.keystrokeEvents
        top_k = request.topK

        # Check if any users are enrolled
        if not authenticator.user_templates:
            raise HTTPException(
                status_code=404,
                detail="No users enrolled yet. Please enroll at least one user first.",
            )

        # Validate minimum keystroke count
        if len(events) < 70:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient data for reliable identification. Need at least 70 keystrokes. Got: {len(events)}",
            )

        # Create sequence from events for TypeNet
        sequence = feature_extractor.create_typenet_sequence(events, sequence_length=70)

        # Identify user
        result = authenticator.identify_user(sequence, top_k)

        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/keystroke/monitor")
async def monitor_session(request: MonitoringRequest):
    """
    Perform continuous authentication on an active session
    Logs auth events to database for instructor timeline
    """
    try:
        user_id = request.userId
        session_id = request.sessionId
        assignment_id = request.assignmentId
        course_id = request.courseId

        # Get events from Redis (fallback to empty list if no session)
        events = redis_client.get_events(user_id, session_id)
        event_count = len(events)

        if event_count < 150:
            return {
                "success": True,
                "status": "COLLECTING_DATA",
                "message": f"Collecting baseline data. {event_count}/150 events captured.",
                "risk_score": 0.0,
            }

        # Create multiple sequences from recent data for TypeNet (last ~350 events)
        sequence_length = 70
        recent_events = events[-350:]
        sequences = []
        for i in range(0, len(recent_events) - sequence_length, sequence_length):
            seq = feature_extractor.create_typenet_sequence(
                recent_events[i : i + sequence_length], sequence_length
            )
            sequences.append(seq)
            if len(sequences) >= 5:
                break

        if not sequences:
            raise HTTPException(status_code=400, detail="Could not create sequences")

        # Perform continuous authentication
        result = authenticator.continuous_authentication(user_id, sequences)

        # Calculate offset_seconds for timeline
        session_start = redis_client.get_session_start_time(user_id, session_id)
        offset_seconds = (
            int((datetime.now() - session_start).total_seconds())
            if session_start
            else 0
        )

        # Classify anomaly type
        anomaly_type = None
        avg_risk = result.get("average_risk_score", 0.0)
        if result["status"] in ["SUSPICIOUS", "REJECTED"]:
            if result.get("max_risk_score", 0) > 0.8:
                anomaly_type = "impostor_detected"
            elif avg_risk > 0.5:
                anomaly_type = "rhythm_shift"
            else:
                anomaly_type = "velocity_fluctuation"

        # Log auth event to database for instructor timeline
        if db_client.enabled:
            db_client.log_auth_event(
                user_id=user_id,
                session_id=session_id,
                offset_seconds=offset_seconds,
                similarity_score=result.get("average_similarity", 0.0),
                risk_score=avg_risk,
                authenticated=result.get("authenticated", False),
                assignment_id=assignment_id,
                course_id=course_id,
                anomaly_type=anomaly_type,
                metadata={"verification_count": result.get("verification_count", 0)},
            )

        # Update session metadata in Redis
        redis_client.update_session_metadata(
            user_id,
            session_id,
            {"last_verification": datetime.now().isoformat(), "risk_score": avg_risk},
        )

        # Publish auth event to RabbitMQ
        auth_event = {
            "studentId": user_id,
            "assignmentId": assignment_id,
            "courseId": course_id,
            "sessionId": session_id,
            "confidenceLevel": (1 - avg_risk) * 100,
            "riskScore": avg_risk * 100,
            "keystrokeSampleSize": event_count,
            "timestamp": datetime.now().isoformat(),
            "authenticated": result.get("authenticated", False),
            "similarityScore": result.get("average_similarity", 0.0) * 100,
            "offsetSeconds": offset_seconds,
            "anomalyType": anomaly_type,
            "metadata": json.dumps(
                {
                    "status": result.get("status"),
                    "verification_count": result.get("verification_count", 0),
                }
            ),
        }
        publish_auth_event(auth_event)

        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/keystroke/session/status/{user_id}/{session_id}")
async def get_session_status(user_id: str, session_id: str):
    """Get current status of a monitoring session from Redis"""
    if not redis_client.session_exists(user_id, session_id):
        raise HTTPException(status_code=404, detail="Session not found")

    metadata = redis_client.get_session_metadata(user_id, session_id)
    event_count = redis_client.get_event_count(user_id, session_id)

    return {
        "success": True,
        "user_id": user_id,
        "session_id": session_id,
        "events_captured": event_count,
        "last_verification": metadata.get("last_verification") if metadata else None,
        "current_risk_score": float(metadata.get("risk_score", 0.0))
        if metadata
        else 0.0,
    }


@app.delete("/api/keystroke/session/{user_id}/{session_id}")
async def end_session(user_id: str, session_id: str):
    """End a monitoring session and clean up Redis data"""
    if redis_client.session_exists(user_id, session_id):
        redis_client.delete_session(user_id, session_id)
        return {"success": True, "message": "Session ended and data cleared"}

    raise HTTPException(status_code=404, detail="Session not found")


@app.get("/api/keystroke/timeline/{session_id}")
async def get_session_timeline(session_id: str):
    """
    Get authentication event timeline for instructor monitoring
    Returns events sorted by offset_seconds for frontend timeline rendering
    """
    if not db_client.enabled:
        return {"success": False, "message": "Database not enabled"}

    timeline = db_client.get_session_timeline(session_id)
    return {
        "success": True,
        "session_id": session_id,
        "event_count": len(timeline),
        "events": [
            {
                **e,
                "event_id": str(e.get("event_id", "")),
                "event_timestamp": e["event_timestamp"].isoformat()
                if hasattr(e.get("event_timestamp"), "isoformat")
                else e.get("event_timestamp", ""),
            }
            for e in timeline
        ],
    }


@app.post("/api/keystroke/session/finalize")
async def finalize_session(request: Dict):
    """
    Finalize session: archive keystroke data to PostgreSQL, cleanup Redis
    Call this after assignment submission for forensic archiving
    """
    try:
        user_id = request.get("userId")
        session_id = request.get("sessionId")
        assignment_id = request.get("assignmentId")
        course_id = request.get("courseId")
        final_code = request.get("finalCode")

        if not user_id or not session_id:
            raise HTTPException(status_code=400, detail="userId and sessionId required")

        # Get all events from Redis
        events = redis_client.get_events(user_id, session_id)

        # Run behavioral analysis before archiving if code is provided
        behavioral_analysis = None
        if final_code and len(events) > 10:
            try:
                analysis_events = [
                    KeystrokeSessionEvent(**{**e, "action": e.get("action", "type")})
                    for e in events[:200]
                ]
                analysis_result = behavioral_analyzer.analyze_session(
                    session_id=session_id,
                    student_id=user_id,
                    events=analysis_events,
                    final_code=final_code,
                )
                behavioral_analysis = analysis_result.dict()
            except Exception as e:
                print(f"⚠️  Behavioral analysis failed: {e}")

        # Archive to PostgreSQL
        if db_client.enabled:
            success = db_client.archive_session(
                user_id=user_id,
                session_id=session_id,
                events=events,
                assignment_id=assignment_id,
                course_id=course_id,
                final_code=final_code,
                behavioral_analysis=behavioral_analysis,
                retention_days=365,
            )
            if not success:
                raise HTTPException(status_code=500, detail="Failed to archive session")

        # Cleanup Redis (remove transient data)
        redis_client.delete_session(user_id, session_id)

        return {
            "success": True,
            "message": "Session archived and Redis cleaned up",
            "events_archived": len(events),
            "assignment_id": assignment_id,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/keystroke/archive/{session_id}")
async def get_archived_session(session_id: str, format: str = "raw"):
    """
    Retrieve archived session for forensic review
    format: 'raw' (full event data) or 'timeline' (processed timeline)
    """
    if not db_client.enabled:
        return {"success": False, "message": "Database not enabled"}

    archive = db_client.get_archived_session(session_id)
    if not archive:
        raise HTTPException(status_code=404, detail="Archived session not found")

    if format == "timeline":
        return {
            "success": True,
            "session_id": session_id,
            "user_id": archive["user_id"],
            "assignment_id": archive["assignment_id"],
            "duration_seconds": archive["session_duration_seconds"],
            "average_risk": archive["average_risk_score"],
            "anomaly_count": archive["anomaly_count"],
            "timeline": db_client.get_session_timeline(session_id),
        }

    return {
        "success": True,
        "archive_id": str(archive.get("archive_id", "")),
        **{k: v for k, v in archive.items() if k != "archive_id"},
    }


@app.post("/api/keystroke/analyze")
async def analyze_behavioral_session(request: BehavioralAnalysisRequest):
    """
    Perform comprehensive behavioral analysis on a coding session

    Analyzes:
    - Developmental logic & iteration patterns
    - Cognitive load & behavioral proxies
    - Authenticity & pattern matching
    - Provides pedagogical feedback

    Returns detailed analysis including:
    - Session metrics
    - Authenticity indicators
    - Cognitive analysis
    - Process scores
    - Critical anomalies
    - Pedagogical recommendations
    """
    try:
        # Convert events to KeystrokeSessionEvent objects
        session_events = []
        for event in request.events:
            try:
                session_event = KeystrokeSessionEvent(
                    timestamp=event.get("timestamp", 0),
                    key=event.get("key", ""),
                    keyCode=event.get("keyCode", 0),
                    dwellTime=event.get("dwellTime", 0),
                    flightTime=event.get("flightTime", 0),
                    action=event.get("action", "type"),
                    lineNumber=event.get("lineNumber"),
                    columnNumber=event.get("columnNumber"),
                    codeSnapshot=event.get("codeSnapshot"),
                )
                session_events.append(session_event)
            except Exception as e:
                print(f"⚠️  Skipping invalid event: {e}")
                continue

        if len(session_events) < 10:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient data for analysis. Need at least 10 valid events. Got: {len(session_events)}",
            )

        # Perform behavioral analysis
        analysis_result = behavioral_analyzer.analyze_session(
            session_id=request.sessionId,
            student_id=request.studentId,
            events=session_events,
            final_code=request.finalCode,
        )

        # Convert to dict for JSON response
        result_dict = analysis_result.model_dump()

        # Optionally include formatted report
        if request.includeReport:
            result_dict["formatted_report"] = format_analysis_report(analysis_result)

        return {"success": True, "analysis": result_dict}

    except HTTPException:
        raise
    except Exception as e:
        import traceback

        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@app.get("/api/keystroke/analyze/config")
async def get_analysis_config():
    """Get current behavioral analysis configuration"""
    return {
        "success": True,
        "config": {
            "llm_enabled": behavioral_analyzer.model is not None,
            "llm_model": "gemini-2.5-flash" if behavioral_analyzer.model else None,
            "analysis_features": [
                "Developmental Logic & Iteration",
                "Cognitive Load Analysis",
                "Authenticity Detection",
                "Pedagogical Feedback",
            ],
            "metrics_tracked": [
                "Typing speed",
                "Pause patterns",
                "Deletion rate",
                "Copy/paste detection",
                "Friction points",
                "Cognitive load timeline",
            ],
        },
    }


@app.get("/api/keystroke/users/enrolled")
async def list_enrolled_users():
    """List all enrolled users"""
    enrolled_users = list(authenticator.user_templates.keys())

    return {"success": True, "count": len(enrolled_users), "users": enrolled_users}


# ==================== WebSocket for Real-Time Monitoring ====================


@app.websocket("/ws/monitor/{user_id}/{session_id}")
async def websocket_monitor(websocket: WebSocket, user_id: str, session_id: str):
    """
    WebSocket endpoint for real-time authentication monitoring
    - Sends historical timeline from database on connect
    - Streams live auth events every 5 seconds
    """
    await websocket.accept()

    try:
        # Send historical timeline data from database on connect
        if db_client.enabled:
            historical = db_client.get_session_timeline(session_id)
            if historical:
                await websocket.send_json(
                    {
                        "type": "timeline_history",
                        "session_id": session_id,
                        "events": [
                            {
                                **e,
                                "event_id": str(e.get("event_id", "")),
                                "event_timestamp": e["event_timestamp"].isoformat()
                                if hasattr(e.get("event_timestamp"), "isoformat")
                                else str(e.get("event_timestamp", "")),
                            }
                            for e in historical
                        ],
                    }
                )

        while True:
            # Check session every 5 seconds
            await asyncio.sleep(5)

            # Get session metadata from Redis
            metadata = redis_client.get_session_metadata(user_id, session_id)
            event_count = redis_client.get_event_count(user_id, session_id)

            if metadata:
                risk_score = float(metadata.get("risk_score", 0.0))

                # Send status update
                await websocket.send_json(
                    {
                        "type": "status_update",
                        "user_id": user_id,
                        "session_id": session_id,
                        "risk_score": risk_score,
                        "events_captured": event_count,
                        "last_verification": metadata.get("last_verification"),
                        "timestamp": datetime.now().isoformat(),
                    }
                )

                # Alert on high risk
                if risk_score > 0.7:
                    await websocket.send_json(
                        {
                            "type": "alert",
                            "level": "HIGH",
                            "message": "Potential impersonation detected!",
                            "risk_score": risk_score,
                        }
                    )
            else:
                # Session ended or doesn't exist
                await websocket.send_json(
                    {
                        "type": "session_ended",
                        "user_id": user_id,
                        "session_id": session_id,
                        "timestamp": datetime.now().isoformat(),
                    }
                )
                break

    except WebSocketDisconnect:
        print(f"WebSocket disconnected for {user_id}:{session_id}")


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", 8003))
    uvicorn.run(app, host="0.0.0.0", port=port)
