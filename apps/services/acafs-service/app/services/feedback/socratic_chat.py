"""Socratic chat service using OpenRouter / Arcee Trinity Large.

Session lifecycle
-----------------
- A session is created automatically the first time a student sends a message
  for a given assignment.
- Exactly ONE active session exists per (assignment_id, user_id) pair.
- The session is closed (status → 'closed', closed_reason → 'submission') when
  the student's submission event is processed by the evaluation worker.
- Session history is preserved for instructor analytics after closure.
"""

import re
from typing import Any
from uuid import UUID

import httpx

from app.config import Settings
from app.logging_config import get_logger
from app.services.feedback.prompts import build_socratic_system_prompt

logger = get_logger(__name__)

_MOCK_PLACEHOLDER = "SET_YOUR_API_KEY_HERE"
# Strip code blocks with > 5 lines that look like full solutions
_LONG_CODE_BLOCK = re.compile(r"```[\s\S]*?```")


def _apply_guardrail(content: str) -> str:
    """Server-side guardrail: replace suspiciously long code blocks."""
    def _replace(m: re.Match) -> str:
        block = m.group(0)
        if block.count("\n") > 5:
            return (
                "What part of the logic would you like to reason through "
                "step by step?"
            )
        return block

    return _LONG_CODE_BLOCK.sub(_replace, content).strip()


class SocraticChatService:
    """Handles Socratic tutoring turns via OpenRouter / Arcee Trinity Large."""

    def __init__(self, settings: Settings):
        self.settings = settings
        self._timeout = httpx.Timeout(30.0, connect=5.0)

    @property
    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.settings.openrouter_api_key}",
            "HTTP-Referer": "http://localhost:3000",
            "X-Title": "ACAFS Socratic Tutor",
            "Content-Type": "application/json",
        }

    # ── public API ─────────────────────────────────────────────────────────

    async def get_hint(
        self,
        *,
        messages: list[dict[str, str]],
        assignment_context: dict[str, Any] | None = None,
        ast_context: dict[str, Any] | None = None,
    ) -> tuple[str, Any]:
        """Generate the next Socratic hint.

        Parameters
        ----------
        messages:
            Full conversation history in OpenAI chat format
            ``[{"role": "user"|"assistant", "content": "..."}]``.
            A sliding window of the last 6 turns is used automatically.
        assignment_context:
            Dict with optional keys: title, assignment_description,
            rubric_skills (list[str]), answer_concepts (list[str]).
        ast_context:
            Compact AST snapshot from ASTBlueprint
            (variables, functions, valid_syntax).

        Returns
        -------
        (content, reasoning_details)
            content          – guardrail-filtered assistant reply
            reasoning_details – raw reasoning from the model (may be None)
        """
        if self.settings.openrouter_api_key == _MOCK_PLACEHOLDER:
            return (
                "What aspect of the problem would you like to think through "
                "first? (Mock hint — set OPENROUTER_API_KEY to enable live tutoring.)",
                None,
            )

        system_prompt = build_socratic_system_prompt(assignment_context, ast_context)

        # Sliding window: last 6 turns to control context size
        recent = messages[-6:] if len(messages) > 6 else messages
        clean_messages = [
            {"role": m["role"], "content": m["content"]} for m in recent
        ]

        # Only request extended reasoning for models that advertise it.
        # Sending it to models that don't support it (e.g. free Arcee Trinity)
        # can cause 400/422 errors.
        _reasoning_models = ("claude-3-7", "o1", "o3", "deepseek-r1", "gemini-2.5")
        supports_reasoning = any(
            tag in self.settings.openrouter_model.lower() for tag in _reasoning_models
        )

        payload: dict = {
            "model": self.settings.openrouter_model,
            "messages": [{"role": "system", "content": system_prompt}] + clean_messages,
        }
        if supports_reasoning:
            payload["reasoning"] = {"enabled": True}

        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(
                    f"{self.settings.openrouter_base_url}/chat/completions",
                    headers=self._headers,
                    json=payload,
                )
                resp.raise_for_status()
                data = resp.json()

                # Parse multiple possible OpenRouter / model response shapes.
                message = None
                reasoning = None

                # Common Chat Completions shape: { choices: [ { message: { content: '...' } } ] }
                choices = data.get("choices") if isinstance(data, dict) else None
                if choices and len(choices) > 0:
                    first = choices[0]
                    # message may be a dict with 'content' as string
                    msg = first.get("message") or first.get("message", {})
                    if isinstance(msg, dict):
                        # content may be str or dict/parts
                        content_field = msg.get("content")
                        if isinstance(content_field, str):
                            message = {"content": content_field}
                        elif isinstance(content_field, dict):
                            # {"parts": ["...text..."]}
                            parts = content_field.get("parts") or content_field.get("texts")
                            if parts and isinstance(parts, list):
                                message = {"content": parts[0]}
                    # Some providers put text at choices[0].get('text')
                    if message is None and first.get("text"):
                        message = {"content": first.get("text")}
                    # reasoning details may be present
                    reasoning = first.get("reasoning_details") or first.get("reasoning")

                # Fallback shapes: { output: "..." } or { result: { output: "..." } }
                if message is None:
                    if isinstance(data.get("output"), str):
                        message = {"content": data.get("output")}
                    elif isinstance(data.get("result"), dict) and isinstance(data["result"].get("output"), str):
                        message = {"content": data["result"]["output"]}

                # Final fallback: try extracting any text-like field
                if message is None:
                    # try to find a top-level string value in the JSON
                    for k, v in (data.items() if isinstance(data, dict) else []):
                        if isinstance(v, str) and len(v) > 0:
                            message = {"content": v}
                            break

                content = _apply_guardrail((message or {}).get("content", ""))
                # If reasoning not found at choice level, try message dict
                if reasoning is None and isinstance(message, dict):
                    reasoning = message.get("reasoning_details") or message.get("reasoning")
                logger.info("socratic_hint_generated", model=self.settings.openrouter_model)
                return content, reasoning
        except Exception as e:
            logger.error("socratic_hint_error", error=str(e))
            return (f"Tutor is temporarily offline. Error: {e}", None)
