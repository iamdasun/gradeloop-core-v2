"""Two-pass rubric grader for ACAFS.

Pass 1 — Qwen reasoning (OpenRouter)
======================================
Qwen3-VL-235B-Thinking performs open-ended analysis of the submission against
every rubric criterion.  It reasons in plain prose — no JSON, no scores.
For deterministic criteria it interprets test-case evidence (including partial
runs) and for LLM/AST criteria it reasons about code quality and patterns.

Pass 2 — Qwen grading (OpenRouter)
=====================================
A second Qwen model receives the full grading prompt PLUS the Pass-1 reasoning
chain as a [PRIOR DEEP ANALYSIS] block.  JSON mode is requested so the response
conforms directly to the grade schema without needing a separate parser.

Fallback
=========
If Pass 1 fails (timeout, API error, etc.) the grader logs a warning and
continues with Pass 2 alone (Qwen grader without prior reasoning), preserving
the pre-existing behaviour.

Grading-mode routing:
  deterministic  → test-case pass/fail counts (authoritative).  Qwen reasons
                   about evidence quality; Qwen grader scores; Judge0 overrides.
  llm            → Qwen grader reasons over student code vs sample answer.
  llm_ast        → Same as llm but with AST blueprint injected.
"""

import json
from typing import Any

import httpx

from app.config import Settings
from app.logging_config import get_logger
from app.services.feedback.prompts import (
    build_reasoning_prompt,
    build_rubric_evaluation_prompt,
)

logger = get_logger(__name__)

_MOCK_PLACEHOLDERS = {"SET_YOUR_API_KEY_HERE", "", None}
_OPENROUTER_TIMEOUT = 120.0  # seconds — Qwen thinking can be slow


class LLMGrader:
    """Two-pass rubric grader: Qwen reasoning (OpenRouter) → Qwen grader (OpenRouter)."""

    def __init__(self, settings: Settings):
        self.settings = settings

    @property
    def _is_mock(self) -> bool:
        return self.settings.openrouter_api_key in _MOCK_PLACEHOLDERS

    @property
    def _has_reasoner(self) -> bool:
        """True when a valid OpenRouter key is configured for Pass 1."""
        return self.settings.openrouter_api_key not in _MOCK_PLACEHOLDERS

    # ── public API ─────────────────────────────────────────────────────────

    async def evaluate(
        self,
        *,
        rubric_data: list[dict[str, Any]],
        student_code: str,
        sample_answer_code: str | None,
        ast_data: dict[str, Any],
        assignment_context: str = "N/A",
    ) -> dict[str, Any]:
        """Evaluate a submission against the rubric using a two-pass pipeline.

        Pass 1 (Qwen via OpenRouter): deep free-form reasoning over all criteria.
          - Deterministic: interprets test-case evidence, handles partial runs.
          - LLM/AST: analyses code quality, patterns, gaps.
          - Skipped (with warning) if OPENROUTER_API_KEY is not configured.

        Pass 2 (Qwen via OpenRouter): produces structured JSON grade, optionally
          grounded in the Pass-1 reasoning chain.

        Returns a dict with keys:
          criteria_scores  – list of {name, analysis, band_selected,
                              band_justification, score, max_score,
                              grading_mode, reason, confidence}
          total_score      – arithmetic sum
          holistic_feedback – single string with three \n\n-separated paragraphs
        """
        if self._is_mock:
            logger.warning("llm_grading_mock", reason="OPENROUTER_API_KEY not configured")
            return self._mock_response(rubric_data)

        # ── Pass 1: Qwen reasoning ──────────────────────────────────────────
        prior_reasoning: str | None = None
        if self._has_reasoner:
            try:
                reasoning_prompt = build_reasoning_prompt(
                    rubric_data=rubric_data,
                    student_code=student_code,
                    sample_answer_code=sample_answer_code,
                    ast_data=ast_data,
                    assignment_context=assignment_context,
                )
                prior_reasoning = await self._call_openrouter(
                    model=self.settings.openrouter_reasoner_model,
                    prompt=reasoning_prompt,
                )
                logger.info(
                    "reasoning_pass_complete",
                    model=self.settings.openrouter_reasoner_model,
                    reasoning_length=len(prior_reasoning),
                )
            except Exception as e:
                logger.warning(
                    "reasoning_pass_failed",
                    model=self.settings.openrouter_reasoner_model,
                    error=str(e),
                    fallback="proceeding with Qwen grader without prior reasoning",
                )
                prior_reasoning = None
        else:
            logger.warning(
                "reasoning_pass_skipped",
                reason="OPENROUTER_API_KEY not configured",
            )

        # ── Pass 2: Qwen grading (OpenRouter) ──────────────────────────────
        grading_prompt = build_rubric_evaluation_prompt(
            rubric_data=rubric_data,
            student_code=student_code,
            sample_answer_code=sample_answer_code,
            ast_data=ast_data,
            assignment_context=assignment_context,
            prior_reasoning=prior_reasoning,
        )
        return await self._call_openrouter_grader(grading_prompt, rubric_data)

    # ── private: Pass-1 OpenRouter call ────────────────────────────────────

    async def _call_openrouter(self, *, model: str, prompt: str) -> str:
        """Send a single-turn chat request to OpenRouter and return the reply text.

        Uses httpx directly (OpenAI-compatible /chat/completions endpoint).
        Raises on non-2xx status or timeout.
        """
        headers = {
            "Authorization": f"Bearer {self.settings.openrouter_api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://gradeloop.app",
            "X-Title": "GradeLoop ACAFS",
        }
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            # Disable thinking budget cap so Qwen can reason as long as needed
            "provider": {"allow_fallbacks": False},
        }
        url = self.settings.openrouter_base_url.rstrip("/") + "/chat/completions"
        async with httpx.AsyncClient(timeout=_OPENROUTER_TIMEOUT) as client:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()
        return data["choices"][0]["message"]["content"]

    # ── private: Pass-2 Qwen grader call (OpenRouter) ──────────────────────

    async def _call_openrouter_grader(
        self, prompt: str, rubric_data: list[dict[str, Any]]
    ) -> dict[str, Any]:
        """Call the Qwen grader via OpenRouter and parse the structured JSON response."""
        try:
            headers = {
                "Authorization": f"Bearer {self.settings.openrouter_api_key}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://gradeloop.app",
                "X-Title": "GradeLoop ACAFS Grader",
            }
            payload = {
                "model": self.settings.openrouter_grader_model,
                "messages": [{"role": "user", "content": prompt}],
                "response_format": {"type": "json_object"},
                "provider": {"allow_fallbacks": False},
            }
            url = self.settings.openrouter_base_url.rstrip("/") + "/chat/completions"
            async with httpx.AsyncClient(timeout=_OPENROUTER_TIMEOUT) as client:
                response = await client.post(url, headers=headers, json=payload)
                response.raise_for_status()
                data = response.json()
            text = data["choices"][0]["message"]["content"].strip()
            if text.startswith("```json"):
                text = text[7:]
            if text.startswith("```"):
                text = text[3:]
            if text.endswith("```"):
                text = text[:-3]
            result = json.loads(text.strip())
            result = self._normalise_feedback(result)
            logger.info(
                "llm_grading_complete",
                model=self.settings.openrouter_grader_model,
                total_score=result.get("total_score"),
                criteria_count=len(result.get("criteria_scores", [])),
            )
            return result
        except Exception as e:
            logger.error("llm_grading_error", error=str(e))
            return {"error": str(e)}

    # ── helpers ────────────────────────────────────────────────────────────

    @staticmethod
    def _normalise_feedback(result: dict[str, Any]) -> dict[str, Any]:
        """Normalise the model's feedback output to a flat holistic_feedback string.

        Handles three possible shapes the model may return:
          1. {"holistic_feedback": "<str>"}                    — new preferred shape
          2. {"feedback": {"holistic_feedback": "<str>"}}     — legacy nested shape
          3. {"structured_feedback": {"what_you_got_right": ...}}  — old 3-key shape
        In all cases the result is normalised so that result["holistic_feedback"] exists
        and any legacy keys are removed.
        """
        # Shape 1 — already correct
        if result.get("holistic_feedback"):
            result.pop("feedback", None)
            result.pop("structured_feedback", None)
            return result
        # Shape 2 — nested under feedback
        nested = result.get("feedback", {})
        if isinstance(nested, dict) and nested.get("holistic_feedback"):
            result["holistic_feedback"] = nested["holistic_feedback"]
            result.pop("feedback", None)
            result.pop("structured_feedback", None)
            return result
        # Shape 3 — old structured_feedback object
        sf = result.get("structured_feedback")
        if sf and isinstance(sf, dict):
            parts = [
                sf.get("what_you_got_right", ""),
                sf.get("what_to_work_on", ""),
                sf.get("think_about_this", ""),
            ]
            result["holistic_feedback"] = "\n\n".join(p for p in parts if p)
            result.pop("feedback", None)
            result.pop("structured_feedback", None)
        return result

    @staticmethod
    def _mock_response(rubric_data: list[dict]) -> dict[str, Any]:
        """Return a deterministic mock for CI / no-key environments.

        Assigns 50 % partial credit to every criterion so mock scores are not
        misleadingly high.
        """
        scores = []
        for c in rubric_data:
            weight = c.get("weight", 10)
            partial = round(weight * 0.5, 2)
            scores.append({
                "name": c.get("name", "Mock Criterion"),
                "analysis": "Mock evaluation — API key not configured.",
                "band_selected": "satisfactory",
                "band_justification": "Defaulting to satisfactory band for mock evaluation.",
                "score": partial,
                "max_score": weight,
                "grading_mode": c.get("grading_mode", "llm"),
                "reason": "Mock evaluation — OpenRouter API key not configured.",
                "confidence": 0.0,
            })
        return {
            "criteria_scores": scores,
            "total_score": sum(s["score"] for s in scores),
            "holistic_feedback": (
                "Your submission has been received.\n\n"
                "This is a mock evaluation — the live grading system is not yet connected.\n\n"
                "What part of the problem did you find most challenging to implement?"
            ),
        }

    # ── override deterministic scores from Judge0 results ──────────────────

    @staticmethod
    def patch_deterministic_scores(
        llm_result: dict[str, Any],
        rubric_data: list[dict],
        deterministic_scores: dict[str, tuple[float, str]],
    ) -> dict[str, Any]:
        """Replace LLM-computed scores for deterministic criteria with the
        authoritative Judge0-derived scores.  Also updates band_selected and
        sets confidence to 1.0 when test cases were present.

        ``deterministic_scores`` maps criterion_name → (score, reason).
        """
        patched = []
        total = 0.0
        name_to_det = {name: (sc, rs) for name, (sc, rs) in deterministic_scores.items()}

        # Build weight lookup for band derivation
        weight_map = {c.get("name", ""): c.get("weight", 10) for c in rubric_data}

        for item in llm_result.get("criteria_scores", []):
            name = item.get("name", "")
            if name in name_to_det:
                score, reason = name_to_det[name]
                weight = weight_map.get(name, item.get("max_score", 10))
                pct = score / weight if weight > 0 else 0.0
                band = (
                    "excellent" if pct >= 0.90
                    else "good" if pct >= 0.70
                    else "satisfactory" if pct >= 0.50
                    else "unsatisfactory"
                )
                item = {
                    **item,
                    "score": score,
                    "reason": reason,
                    "band_selected": band,
                    "band_justification": f"Pass rate {pct:.0%} maps to {band} band.",
                    "confidence": 1.0 if weight > 0 else 0.0,
                }
            patched.append(item)
            total += item.get("score", 0)

        llm_result = {**llm_result, "criteria_scores": patched, "total_score": round(total, 2)}
        return llm_result