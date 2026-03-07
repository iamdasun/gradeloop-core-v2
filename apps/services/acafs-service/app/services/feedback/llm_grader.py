"""Gemini-based rubric grader for ACAFS.

Uses google-genai SDK with Gemini 2.5 Flash (thinking enabled by default in
2.5 Flash).  Evaluates ALL rubric criteria in a single prompt call, returning
a structured JSON breakdown that maps directly onto the SubmissionGrade schema.

Grading-mode routing (enforced in prompts.py guidelines):
  deterministic  → Gemini uses Judge0 test-case pass/fail counts as primary
                   signal and explains the score arithmetically.
  llm            → Gemini reasons over student code vs sample answer.
  llm_ast        → Same as llm but with AST blueprint injected for structural
                   evidence (function signatures, control flow, identifiers).
"""

import asyncio
import json
from typing import Any

from google import genai

from app.config import Settings
from app.logging_config import get_logger
from app.services.feedback.prompts import build_rubric_evaluation_prompt

logger = get_logger(__name__)

_MOCK_PLACEHOLDER = "SET_YOUR_API_KEY_HERE"


class LLMGrader:
    """Rubric evaluation via Gemini 2.5 Flash."""

    def __init__(self, settings: Settings):
        self.settings = settings
        self._client: genai.Client | None = None

    def _get_client(self) -> genai.Client:
        if self._client is None:
            self._client = genai.Client(api_key=self.settings.gemini_api_key)
        return self._client

    # ── public API ─────────────────────────────────────────────────────────

    async def evaluate(
        self,
        *,
        rubric_data: list[dict[str, Any]],
        student_code: str,
        sample_answer_code: str | None,
        ast_data: dict[str, Any],
        execution_data: list[dict[str, Any]],
        assignment_context: str = "N/A",
    ) -> dict[str, Any]:
        """Evaluate a submission against the rubric.

        Returns a dict with keys:
          criteria_scores  – list of {name, score, max_score, grading_mode, reason}
          total_score      – arithmetic sum
          feedback         – {holistic_feedback: str}

        Falls back to a mock response when no API key is configured.
        """
        if self.settings.gemini_api_key == _MOCK_PLACEHOLDER:
            return self._mock_response(rubric_data)

        prompt = build_rubric_evaluation_prompt(
            rubric_data=rubric_data,
            student_code=student_code,
            sample_answer_code=sample_answer_code,
            ast_data=ast_data,
            execution_data=execution_data,
            assignment_context=assignment_context,
        )

        try:
            client = self._get_client()
            response = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: client.models.generate_content(
                    model=self.settings.gemini_model,
                    contents=prompt,
                ),
            )
            text = response.text.strip()
            # Strip markdown fences the model may still emit
            if text.startswith("```json"):
                text = text[7:]
            if text.startswith("```"):
                text = text[3:]
            if text.endswith("```"):
                text = text[:-3]
            result = json.loads(text.strip())
            logger.info(
                "llm_grading_complete",
                total_score=result.get("total_score"),
                criteria_count=len(result.get("criteria_scores", [])),
            )
            return result
        except Exception as e:
            logger.error("llm_grading_error", error=str(e))
            return {"error": str(e)}

    # ── helpers ────────────────────────────────────────────────────────────

    @staticmethod
    def _mock_response(rubric_data: list[dict]) -> dict[str, Any]:
        """Return a deterministic mock for CI / no-key environments."""
        scores = [
            {
                "name": c.get("name", "Mock Criterion"),
                "score": c.get("weight", 10),
                "max_score": c.get("weight", 10),
                "grading_mode": c.get("grading_mode", "llm"),
                "reason": "Mock evaluation — Gemini API key not configured.",
            }
            for c in rubric_data
        ]
        return {
            "criteria_scores": scores,
            "total_score": sum(s["score"] for s in scores),
            "feedback": {
                "holistic_feedback": (
                    "Your submission has been received. "
                    "This is a mock evaluation — the live grading system is not yet connected. "
                    "What part of the problem did you find most challenging to implement?"
                )
            },
        }

    # ── override deterministic scores from Judge0 results ──────────────────

    @staticmethod
    def patch_deterministic_scores(
        llm_result: dict[str, Any],
        rubric_data: list[dict],
        deterministic_scores: dict[str, tuple[float, str]],
    ) -> dict[str, Any]:
        """Replace LLM-computed scores for deterministic criteria with the
        authoritative Judge0-derived scores.

        ``deterministic_scores`` maps criterion_name → (score, reason).
        """
        patched = []
        total = 0.0
        name_to_det = {name: (sc, rs) for name, (sc, rs) in deterministic_scores.items()}

        for item in llm_result.get("criteria_scores", []):
            name = item.get("name", "")
            if name in name_to_det:
                score, reason = name_to_det[name]
                item = {**item, "score": score, "reason": reason}
            patched.append(item)
            total += item.get("score", 0)

        llm_result = {**llm_result, "criteria_scores": patched, "total_score": round(total, 2)}
        return llm_result
