"""
Redis Client Module
High-speed session buffering with TTL for keystroke events
"""

import os
import json
from typing import List, Dict, Optional
import redis
from datetime import datetime


class RedisSessionClient:
    """
    Redis client for session-based keystroke event buffering
    Replaces in-memory active_sessions dictionary
    """

    def __init__(self, redis_url: str = None, session_ttl: int = 7200):
        """
        Initialize Redis client

        Args:
            redis_url: Redis connection string (from env if not provided)
            session_ttl: Session TTL in seconds (default 2 hours)
        """
        self.redis_url = redis_url or os.getenv("REDIS_URL", "redis://localhost:6379")
        self.session_ttl = session_ttl

        try:
            self.client = redis.from_url(
                self.redis_url,
                decode_responses=True,  # Auto-decode strings
                socket_timeout=5,
                socket_connect_timeout=5,
            )

            # Test connection
            self.client.ping()
            self.enabled = True
            print(f"✅ Redis connected: {self.redis_url} (TTL: {session_ttl}s)")

        except Exception as e:
            print(f"⚠️  Redis connection failed: {e}")
            print("   Falling back to in-memory storage")
            self.client = None
            self.enabled = False
            self._memory_store = {}  # Fallback

    def _get_session_key(self, user_id: str, session_id: str) -> str:
        """Generate Redis key for session"""
        return f"session:{user_id}:{session_id}"

    def _get_events_key(self, user_id: str, session_id: str) -> str:
        """Generate Redis key for session events list"""
        return f"events:{user_id}:{session_id}"

    # ==================== Session Management ====================

    def create_session(
        self, user_id: str, session_id: str, metadata: Dict = None
    ) -> bool:
        """
        Create new session with metadata

        Args:
            user_id: User identifier
            session_id: Session identifier
            metadata: Initial session metadata (assignment_id, course_id, etc.)

        Returns:
            True if successful
        """
        session_key = self._get_session_key(user_id, session_id)

        if self.enabled:
            try:
                session_data = {
                    "user_id": user_id,
                    "session_id": session_id,
                    "created_at": datetime.now().isoformat(),
                    "last_verification": None,
                    "risk_score": 0.0,
                    "event_count": 0,
                    **(metadata or {}),
                }

                # Store session metadata
                self.client.hset(
                    session_key,
                    mapping={
                        k: json.dumps(v) if isinstance(v, (dict, list)) else str(v)
                        for k, v in session_data.items()
                    },
                )

                # Set TTL
                self.client.expire(session_key, self.session_ttl)

                return True

            except Exception as e:
                print(f"❌ Redis error creating session: {e}")
                return False
        else:
            # Fallback to memory
            self._memory_store[session_key] = {
                "events": [],
                "created_at": datetime.now().isoformat(),
                "last_verification": None,
                "risk_score": 0.0,
                **(metadata or {}),
            }
            return True

    def session_exists(self, user_id: str, session_id: str) -> bool:
        """Check if session exists"""
        session_key = self._get_session_key(user_id, session_id)

        if self.enabled:
            try:
                return self.client.exists(session_key) > 0
            except Exception:
                return False
        else:
            return session_key in self._memory_store

    def get_session_metadata(self, user_id: str, session_id: str) -> Optional[Dict]:
        """Get session metadata"""
        session_key = self._get_session_key(user_id, session_id)

        if self.enabled:
            try:
                data = self.client.hgetall(session_key)
                if not data:
                    return None

                # Deserialize JSON fields
                result = {}
                for k, v in data.items():
                    try:
                        result[k] = json.loads(v)
                    except (json.JSONDecodeError, TypeError):
                        result[k] = v

                return result

            except Exception as e:
                print(f"❌ Redis error getting session: {e}")
                return None
        else:
            session = self._memory_store.get(session_key)
            if session:
                # Return copy without events
                return {k: v for k, v in session.items() if k != "events"}
            return None

    def update_session_metadata(
        self, user_id: str, session_id: str, updates: Dict
    ) -> bool:
        """Update session metadata fields"""
        session_key = self._get_session_key(user_id, session_id)

        if self.enabled:
            try:
                # Update fields
                self.client.hset(
                    session_key,
                    mapping={
                        k: json.dumps(v) if isinstance(v, (dict, list)) else str(v)
                        for k, v in updates.items()
                    },
                )

                # Refresh TTL
                self.client.expire(session_key, self.session_ttl)
                return True

            except Exception as e:
                print(f"❌ Redis error updating session: {e}")
                return False
        else:
            if session_key in self._memory_store:
                self._memory_store[session_key].update(updates)
                return True
            return False

    def delete_session(self, user_id: str, session_id: str) -> bool:
        """Delete session and all associated data"""
        session_key = self._get_session_key(user_id, session_id)
        events_key = self._get_events_key(user_id, session_id)

        if self.enabled:
            try:
                pipeline = self.client.pipeline()
                pipeline.delete(session_key)
                pipeline.delete(events_key)
                pipeline.execute()
                return True
            except Exception as e:
                print(f"❌ Redis error deleting session: {e}")
                return False
        else:
            if session_key in self._memory_store:
                del self._memory_store[session_key]
            return True

    # ==================== Event Buffering ====================

    def append_events(
        self, user_id: str, session_id: str, events: List[Dict], max_buffer: int = 500
    ) -> int:
        """
        Append keystroke events to session buffer

        Args:
            user_id: User identifier
            session_id: Session identifier
            events: List of keystroke events
            max_buffer: Maximum events to keep (circular buffer)

        Returns:
            Total events in buffer
        """
        events_key = self._get_events_key(user_id, session_id)
        session_key = self._get_session_key(user_id, session_id)

        if self.enabled:
            try:
                # Create session if doesn't exist
                if not self.session_exists(user_id, session_id):
                    self.create_session(user_id, session_id)

                # Append events to list (RPUSH)
                pipeline = self.client.pipeline()
                for event in events:
                    pipeline.rpush(events_key, json.dumps(event))

                # Trim to max buffer size (keep last N)
                pipeline.ltrim(events_key, -max_buffer, -1)

                # Update event count
                pipeline.hset(
                    session_key,
                    "event_count",
                    self.client.llen(events_key) + len(events),
                )

                # Refresh TTLs
                pipeline.expire(events_key, self.session_ttl)
                pipeline.expire(session_key, self.session_ttl)

                pipeline.execute()

                # Get total count
                total = self.client.llen(events_key)
                return total

            except Exception as e:
                print(f"❌ Redis error appending events: {e}")
                return 0
        else:
            # Fallback to memory
            if session_key not in self._memory_store:
                self.create_session(user_id, session_id)

            self._memory_store[session_key]["events"].extend(events)
            # Circular buffer
            if len(self._memory_store[session_key]["events"]) > max_buffer:
                self._memory_store[session_key]["events"] = self._memory_store[
                    session_key
                ]["events"][-max_buffer:]

            return len(self._memory_store[session_key]["events"])

    def get_events(
        self, user_id: str, session_id: str, count: int = None, start: int = 0
    ) -> List[Dict]:
        """
        Retrieve events from session buffer

        Args:
            user_id: User identifier
            session_id: Session identifier
            count: Number of events to retrieve (None = all)
            start: Starting index (0 = oldest)

        Returns:
            List of keystroke events
        """
        events_key = self._get_events_key(user_id, session_id)

        if self.enabled:
            try:
                # Get range from list
                if count is None:
                    events_json = self.client.lrange(events_key, start, -1)
                else:
                    events_json = self.client.lrange(
                        events_key, start, start + count - 1
                    )

                return [json.loads(e) for e in events_json]

            except Exception as e:
                print(f"❌ Redis error getting events: {e}")
                return []
        else:
            session_key = self._get_session_key(user_id, session_id)
            if session_key in self._memory_store:
                events = self._memory_store[session_key]["events"]
                if count is None:
                    return events[start:]
                else:
                    return events[start : start + count]
            return []

    def get_recent_events(
        self, user_id: str, session_id: str, count: int = 100
    ) -> List[Dict]:
        """Get most recent N events"""
        events_key = self._get_events_key(user_id, session_id)

        if self.enabled:
            try:
                # Get last N events
                events_json = self.client.lrange(events_key, -count, -1)
                return [json.loads(e) for e in events_json]
            except Exception as e:
                print(f"❌ Redis error getting recent events: {e}")
                return []
        else:
            session_key = self._get_session_key(user_id, session_id)
            if session_key in self._memory_store:
                return self._memory_store[session_key]["events"][-count:]
            return []

    def get_event_count(self, user_id: str, session_id: str) -> int:
        """Get total event count for session"""
        events_key = self._get_events_key(user_id, session_id)

        if self.enabled:
            try:
                return self.client.llen(events_key)
            except Exception:
                return 0
        else:
            session_key = self._get_session_key(user_id, session_id)
            if session_key in self._memory_store:
                return len(self._memory_store[session_key]["events"])
            return 0

    # ==================== Session Session Start Time ====================

    def get_session_start_time(
        self, user_id: str, session_id: str
    ) -> Optional[datetime]:
        """Get session creation timestamp"""
        metadata = self.get_session_metadata(user_id, session_id)
        if metadata and "created_at" in metadata:
            try:
                return datetime.fromisoformat(metadata["created_at"])
            except (ValueError, TypeError):
                pass
        return None

    # ==================== Utility ====================

    def get_all_sessions(self) -> List[Dict]:
        """Get all active sessions (for monitoring/debugging)"""
        if self.enabled:
            try:
                # Scan for session keys
                sessions = []
                for key in self.client.scan_iter(match="session:*:*"):
                    metadata = self.client.hgetall(key)
                    if metadata:
                        sessions.append(
                            {
                                "key": key,
                                **{
                                    k: json.loads(v) if v.startswith("{") else v
                                    for k, v in metadata.items()
                                },
                            }
                        )
                return sessions
            except Exception as e:
                print(f"❌ Redis error getting all sessions: {e}")
                return []
        else:
            return [
                {"key": k, **{kk: vv for kk, vv in v.items() if kk != "events"}}
                for k, v in self._memory_store.items()
            ]

    def health_check(self) -> bool:
        """Check Redis connection health"""
        if self.enabled:
            try:
                self.client.ping()
                return True
            except Exception:
                return False
        return False

    def close(self):
        """Close Redis connection"""
        if self.enabled and self.client:
            self.client.close()
            print("✅ Redis connection closed")


# Singleton instance
_redis_client = None


def get_redis_client() -> RedisSessionClient:
    """Get or create Redis client singleton"""
    global _redis_client
    if _redis_client is None:
        _redis_client = RedisSessionClient()
    return _redis_client
