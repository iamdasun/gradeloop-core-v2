"""Judge0 client for deterministic test-case execution.

Submits student code to Judge0 for each test case and returns structured
pass/fail results.  The ``deterministic`` grading mode is heavily biased
toward these results — they are the authoritative signal for that criterion.
"""

import asyncio
from typing import Any, Optional

import httpx

from app.config import Settings
from app.logging_config import get_logger

logger = get_logger(__name__)

# Judge0 status IDs that count as a successful execution
_ACCEPTED_STATUS_ID = 3


class Judge0Client:
    """Async client for Judge0 code execution."""

    def __init__(self, settings: Settings):
        self.base_url = settings.judge0_url.rstrip("/")
        self.api_key = settings.judge0_api_key
        self._timeout = httpx.Timeout(30.0, connect=5.0)

    def _headers(self) -> dict:
        h = {"Content-Type": "application/json"}
        if self.api_key:
            h["X-Auth-Token"] = self.api_key
        return h

    # ── single submission ──────────────────────────────────────────────────

    async def run_single(
        self,
        language_id: int,
        source_code: str,
        stdin: str = "",
        expected_output: str = "",
    ) -> dict[str, Any]:
        """Submit a single code execution and wait for the result.

        Returns the raw Judge0 submission object.
        """
        payload = {
            "language_id": language_id,
            "source_code": source_code,
            "stdin": stdin,
            "expected_output": expected_output,
        }
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.post(
                f"{self.base_url}/submissions?base64_encoded=false&wait=true",
                headers=self._headers(),
                json=payload,
            )
            resp.raise_for_status()
            return resp.json()

    # ── batch submission ───────────────────────────────────────────────────

    @staticmethod
    def _normalize_output(output: str) -> str:
        """Normalize output for comparison.

        - Normalize line endings (CRLF -> LF)
        - Split into lines
        - Strip trailing whitespace from each line
        - Rejoin with newline
        - Strip leading/trailing whitespace from the entire output
        """
        if not output:
            return ""
        # Normalize line endings: CRLF -> LF, and handle stray CR
        output = output.replace("\r\n", "\n").replace("\r", "\n")
        lines = output.split("\n")
        normalized_lines = [line.rstrip() for line in lines]
        result = "\n".join(normalized_lines)
        return result.strip()

    async def run_batch(
        self,
        language_id: int,
        source_code: str,
        test_cases: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Run all test cases concurrently and return results list.

        Each item in *test_cases* must have at least ``input`` and
        ``expected_output`` keys; an optional ``id`` key is preserved.

        Returns a list parallel to *test_cases* with Judge0 result dicts
        augmented with ``test_case_id``, ``passed``, and ``test_input`` keys.
        """
        if not test_cases:
            return []

        tasks = [
            self.run_single(
                language_id=language_id,
                source_code=source_code,
                stdin=tc.get("input", ""),
                expected_output=tc.get("expected_output", ""),
            )
            for tc in test_cases
        ]

        raw_results: list[dict] = await asyncio.gather(*tasks, return_exceptions=True)

        results = []
        for tc, raw in zip(test_cases, raw_results):
            tc_id = str(tc.get("id", tc.get("test_case_id", "")))
            expected = self._normalize_output(tc.get("expected_output") or "")

            if isinstance(raw, Exception):
                logger.warning(
                    "judge0_test_case_error",
                    test_case_id=tc_id,
                    error=str(raw),
                )
                results.append(
                    {
                        "test_case_id": tc_id,
                        "test_input": tc.get("input", ""),
                        "expected_output": expected,
                        "actual_output": "",
                        "passed": False,
                        "status_id": 0,
                        "status_description": f"Judge0 error: {raw}",
                        "execution_time": None,
                        "memory_used": None,
                    }
                )
                continue

            status_id: int = raw.get("status", {}).get("id", 0)
            status_desc: str = raw.get("status", {}).get("description", "Unknown")
            actual: str = self._normalize_output(raw.get("stdout") or "")
            passed: bool = status_id == _ACCEPTED_STATUS_ID and actual == expected

            results.append(
                {
                    "test_case_id": tc_id,
                    "test_input": tc.get("input", ""),
                    "expected_output": expected,
                    "actual_output": actual,
                    "passed": passed,
                    "status_id": status_id,
                    "status_description": status_desc,
                    "execution_time": raw.get("time"),
                    "memory_used": raw.get("memory"),
                    "compile_output": raw.get("compile_output"),
                    "stderr": raw.get("stderr"),
                }
            )

        return results

    # ── score helper ───────────────────────────────────────────────────────

    @staticmethod
    def compute_deterministic_score(
        results: list[dict],
        weight: float,
    ) -> tuple[float, str]:
        """Return (score, instructor_reason) for a deterministic criterion.

        Score formula: score = round(weight × passed / total, 2)
        The reason string is the canonical evidence for the ``reason`` field.
        """
        total = len(results)
        if total == 0:
            return 0.0, "No test cases provided — scored 0."

        passed = sum(1 for r in results if r.get("passed"))
        score = round(weight * passed / total, 2)

        failed_details = [
            f"TC#{r['test_case_id']}: expected {r['expected_output']!r}, "
            f"got {r['actual_output']!r} (status: {r['status_description']})"
            for r in results
            if not r.get("passed")
        ]
        reason = f"Passed {passed}/{total} test cases → awarded {score}/{weight}. "
        if failed_details:
            reason += "Failures: " + "; ".join(failed_details[:3])
            if len(failed_details) > 3:
                reason += f" … and {len(failed_details) - 3} more."
        return score, reason
