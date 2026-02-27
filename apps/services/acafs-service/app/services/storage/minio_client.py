"""MinIO client for retrieving source code from object storage."""

from typing import Optional

from minio import Minio
from minio.error import S3Error

from app.logging_config import get_logger
from app.schemas import SubmissionEvent

logger = get_logger(__name__)


class MinIOClient:
    """Client for MinIO object storage operations."""

    def __init__(
        self,
        endpoint: str,
        access_key: str,
        secret_key: str,
        bucket_name: str,
        use_ssl: bool = False,
    ):
        """Initialize MinIO client.
        
        Args:
            endpoint: MinIO server endpoint (host:port)
            access_key: Access key for authentication
            secret_key: Secret key for authentication
            bucket_name: Default bucket name
            use_ssl: Whether to use HTTPS
        """
        self.client = Minio(
            endpoint,
            access_key=access_key,
            secret_key=secret_key,
            secure=use_ssl,
        )
        self.bucket_name = bucket_name
        self._ensure_bucket_exists()

    def _ensure_bucket_exists(self) -> None:
        """Ensure the target bucket exists."""
        try:
            if not self.client.bucket_exists(self.bucket_name):
                self.client.make_bucket(self.bucket_name)
                logger.info("minio_bucket_created", bucket=self.bucket_name)
            else:
                logger.debug("minio_bucket_ready", bucket=self.bucket_name)
        except S3Error as e:
            logger.error("minio_bucket_check_failed", error=str(e))
            raise

    async def get_submission_code(self, storage_path: str) -> str:
        """Retrieve source code from MinIO.
        
        Args:
            storage_path: Object key/path in MinIO
            
        Returns:
            Source code as string
            
        Raises:
            S3Error: If object retrieval fails
        """
        try:
            response = self.client.get_object(self.bucket_name, storage_path)
            code = response.read().decode("utf-8")
            response.close()
            response.release_conn()
            
            logger.info(
                "code_retrieved_from_minio",
                storage_path=storage_path,
                bytes=len(code),
            )
            return code
        except S3Error as e:
            logger.error(
                "minio_retrieval_failed",
                storage_path=storage_path,
                error=str(e),
            )
            raise

    async def get_code_from_event(self, event: SubmissionEvent) -> str:
        """Get code from event or fetch from MinIO if needed.
        
        Args:
            event: Submission event containing code or storage path
            
        Returns:
            Source code as string
        """
        # If code is directly in event, use it
        if event.code:
            return event.code
            
        # Otherwise fetch from MinIO
        return await self.get_submission_code(event.storage_path)
