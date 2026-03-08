"""
Behavioral Analysis Service
Analyzes keystroke session logs to evaluate cognitive process, authenticity, and learning patterns
"""

import json
import os
import statistics
from datetime import datetime
from typing import Dict, List, Optional

import google.generativeai as genai
from pydantic import BaseModel

# ==================== Data Models ====================


class KeystrokeSessionEvent(BaseModel):
    """Individual keystroke event in a coding session"""

    timestamp: float  # milliseconds since session start
    key: str
    keyCode: int
    dwellTime: float  # time key was held down (ms)
    flightTime: float  # time between this key and previous key (ms)
    action: str  # 'type', 'delete', 'paste', etc.
    lineNumber: Optional[int] = None
    columnNumber: Optional[int] = None
    codeSnapshot: Optional[str] = None  # code state at this moment


class SessionMetrics(BaseModel):
    """Computed metrics from session analysis"""

    total_duration: int  # seconds
    total_keystrokes: int
    average_typing_speed: float  # characters per minute
    pause_count: int
    long_pause_count: int  # pauses > 3 seconds
    deletion_count: int
    deletion_rate: float
    paste_count: int
    copy_count: int
    avg_dwell_time: float
    std_dwell_time: float
    avg_flight_time: float
    std_flight_time: float
    burst_typing_events: int  # very fast typing bursts
    rhythm_consistency: float  # 0-1 score
    friction_points: List[Dict[str, Any]]  # moments of struggle


class AuthenticityIndicators(BaseModel):
    """Signals related to work authenticity"""

    human_signature_score: float  # 0-100, natural human patterns
    synthetic_signature_score: float  # 0-100, AI/copy-paste indicators
    consistency_score: float  # 0-100, pattern consistency
    anomaly_flags: List[Dict[str, Any]]
    multiple_contributor_probability: float  # 0-1
    external_assistance_probability: float  # 0-1


class CognitiveAnalysis(BaseModel):
    """Cognitive process and learning analysis"""

    incremental_construction: bool
    pivotal_moments: List[Dict[str, Any]]
    troubleshooting_style: str  # 'systematic', 'erratic', 'confident'
    cognitive_load_timeline: List[Dict[str, float]]
    high_friction_concepts: List[str]
    struggle_areas: List[Dict[str, Any]]
    mastery_indicators: List[str]


class ProcessScore(BaseModel):
    """Overall evaluation of the creation process"""

    active_problem_solving_score: float  # 0-100
    learning_depth_score: float  # 0-100
    authenticity_score: float  # 0-100
    engagement_score: float  # 0-100
    overall_score: float  # 0-100
    confidence_level: str  # 'HIGH', 'MEDIUM', 'LOW'


class BehavioralAnalysisResult(BaseModel):
    """Complete behavioral analysis output"""

    session_id: str
    student_id: str
    timestamp: datetime
    session_metrics: SessionMetrics
    authenticity_indicators: AuthenticityIndicators
    cognitive_analysis: CognitiveAnalysis
    process_score: ProcessScore
    llm_insights: Dict[str, Any]
    critical_anomalies: List[str]
    pedagogical_feedback: Dict[str, Any]


# ==================== Analysis Engine ====================


class BehavioralAnalyzer:
    """Main analyzer for keystroke session logs"""

    def __init__(self, gemini_api_key: Optional[str] = None):
        self.gemini_api_key = gemini_api_key or os.getenv("GEMINI_API_KEY")
        if self.gemini_api_key:
            genai.configure(api_key=self.gemini_api_key)
            self.model = genai.GenerativeModel("gemini-2.5-flash")
        else:
            self.model = None
            print(
                "⚠️  Warning: No Gemini API key provided. LLM analysis will be disabled."
            )

    def analyze_session(
        self,
        session_id: str,
        student_id: str,
        events: List[KeystrokeSessionEvent],
        final_code: str,
    ) -> BehavioralAnalysisResult:
        """
        Perform comprehensive behavioral analysis on a coding session
        """
        # Compute session metrics
        session_metrics = self._compute_session_metrics(events)

        # Analyze authenticity
        authenticity = self._analyze_authenticity(events, session_metrics)

        # Cognitive analysis
        cognitive = self._analyze_cognitive_process(events, session_metrics, final_code)

        # Process scoring
        process_score = self._compute_process_score(
            session_metrics, authenticity, cognitive
        )

        # LLM-based deep analysis
        llm_insights = {}
        critical_anomalies = []
        pedagogical_feedback = {}

        if self.model:
            llm_insights = self._llm_deep_analysis(
                events, session_metrics, authenticity, cognitive, final_code
            )
            critical_anomalies = llm_insights.get("critical_anomalies", [])
            pedagogical_feedback = llm_insights.get("pedagogical_feedback", {})
        else:
            critical_anomalies = self._rule_based_anomalies(
                authenticity, session_metrics
            )
            pedagogical_feedback = self._basic_pedagogical_feedback(
                cognitive, session_metrics
            )

        return BehavioralAnalysisResult(
            session_id=session_id,
            student_id=student_id,
            timestamp=datetime.now(),
            session_metrics=session_metrics,
            authenticity_indicators=authenticity,
            cognitive_analysis=cognitive,
            process_score=process_score,
            llm_insights=llm_insights,
            critical_anomalies=critical_anomalies,
            pedagogical_feedback=pedagogical_feedback,
        )

    def _compute_session_metrics(
        self, events: List[KeystrokeSessionEvent]
    ) -> SessionMetrics:
        """Compute basic metrics from keystroke events"""
        if not events:
            return SessionMetrics(
                total_duration=0,
                total_keystrokes=0,
                average_typing_speed=0,
                pause_count=0,
                long_pause_count=0,
                deletion_count=0,
                deletion_rate=0,
                paste_count=0,
                copy_count=0,
                avg_dwell_time=0,
                std_dwell_time=0,
                avg_flight_time=0,
                std_flight_time=0,
                burst_typing_events=0,
                rhythm_consistency=0,
                friction_points=[],
            )

        total_duration = (events[-1].timestamp - events[0].timestamp) / 1000  # seconds
        total_keystrokes = len(events)

        # Typing speed (CPM)
        typing_chars = sum(1 for e in events if len(e.key) == 1 and e.action == "type")
        average_typing_speed = (
            (typing_chars / total_duration * 60) if total_duration > 0 else 0
        )

        # Pauses
        flight_times = [e.flightTime for e in events if e.flightTime > 0]
        pause_threshold = 1000  # 1 second
        long_pause_threshold = 3000  # 3 seconds
        pause_count = sum(1 for ft in flight_times if ft > pause_threshold)
        long_pause_count = sum(1 for ft in flight_times if ft > long_pause_threshold)

        # Deletions
        deletion_count = sum(
            1 for e in events if "Backspace" in e.key or "Delete" in e.key
        )
        deletion_rate = deletion_count / total_keystrokes if total_keystrokes > 0 else 0

        # Copy/Paste
        paste_count = sum(
            1 for e in events if hasattr(e, "action") and "paste" in e.action.lower()
        )
        copy_count = sum(
            1 for e in events if hasattr(e, "action") and "copy" in e.action.lower()
        )

        # Timing statistics
        dwell_times = [e.dwellTime for e in events if e.dwellTime > 0]
        avg_dwell = statistics.mean(dwell_times) if dwell_times else 0
        std_dwell = statistics.stdev(dwell_times) if len(dwell_times) > 1 else 0

        avg_flight = statistics.mean(flight_times) if flight_times else 0
        std_flight = statistics.stdev(flight_times) if len(flight_times) > 1 else 0

        # Burst typing (very fast consistent typing)
        burst_events = sum(1 for ft in flight_times if ft < 100)  # < 100ms between keys

        # Rhythm consistency (inverse of coefficient of variation)
        rhythm_consistency = 1 - (std_flight / avg_flight) if avg_flight > 0 else 0
        rhythm_consistency = max(0, min(1, rhythm_consistency))

        # Friction points (areas with high deletion rates and long pauses)
        friction_points = self._identify_friction_points(events)

        return SessionMetrics(
            total_duration=int(total_duration),
            total_keystrokes=total_keystrokes,
            average_typing_speed=round(average_typing_speed, 2),
            pause_count=pause_count,
            long_pause_count=long_pause_count,
            deletion_count=deletion_count,
            deletion_rate=round(deletion_rate, 3),
            paste_count=paste_count,
            copy_count=copy_count,
            avg_dwell_time=round(avg_dwell, 2),
            std_dwell_time=round(std_dwell, 2),
            avg_flight_time=round(avg_flight, 2),
            std_flight_time=round(std_flight, 2),
            burst_typing_events=burst_events,
            rhythm_consistency=round(rhythm_consistency, 3),
            friction_points=friction_points,
        )

    def _identify_friction_points(
        self, events: List[KeystrokeSessionEvent]
    ) -> List[Dict[str, Any]]:
        """Identify moments of struggle in the coding session"""
        friction_points = []
        window_size = 50  # analyze 50-keystroke windows

        for i in range(0, len(events) - window_size, window_size // 2):
            window = events[i : i + window_size]

            # Calculate friction indicators
            deletions = sum(
                1 for e in window if "Backspace" in e.key or "Delete" in e.key
            )
            long_pauses = sum(1 for e in window if e.flightTime > 3000)

            deletion_rate = deletions / len(window)

            # High friction if many deletions or long pauses
            if deletion_rate > 0.3 or long_pauses > 2:
                friction_points.append(
                    {
                        "timestamp": window[0].timestamp,
                        "duration": (window[-1].timestamp - window[0].timestamp) / 1000,
                        "deletion_rate": round(deletion_rate, 2),
                        "long_pauses": long_pauses,
                        "severity": "high" if deletion_rate > 0.5 else "medium",
                    }
                )

        return friction_points

    def _analyze_authenticity(
        self, events: List[KeystrokeSessionEvent], metrics: SessionMetrics
    ) -> AuthenticityIndicators:
        """Analyze authenticity indicators"""

        # Human signature score (natural variations, errors, pauses)
        human_score = 50.0
        human_score += min(30, metrics.deletion_rate * 100)  # humans make mistakes
        human_score += min(20, len(metrics.friction_points) * 5)  # humans struggle
        human_score -= min(
            20, metrics.burst_typing_events / 10
        )  # too fast is suspicious
        human_score = max(0, min(100, human_score))

        # Synthetic signature (perfect typing, large pastes, no errors)
        synthetic_score = 0.0
        if metrics.paste_count > 5:
            synthetic_score += 30
        if metrics.deletion_rate < 0.02:  # almost no errors
            synthetic_score += 25
        if metrics.burst_typing_events > 100:  # too consistent
            synthetic_score += 25
        if metrics.pause_count < 3:  # no thinking pauses
            synthetic_score += 20
        synthetic_score = min(100, synthetic_score)

        # Consistency score (pattern regularity)
        consistency_score = metrics.rhythm_consistency * 100

        # Anomaly detection
        anomalies = []

        if metrics.paste_count > 3:
            anomalies.append(
                {
                    "type": "excessive_paste",
                    "severity": "high",
                    "description": f"Detected {metrics.paste_count} paste operations",
                    "timestamp": datetime.now().isoformat(),
                }
            )

        if metrics.average_typing_speed > 500:
            anomalies.append(
                {
                    "type": "superhuman_speed",
                    "severity": "critical",
                    "description": f"Typing speed {metrics.average_typing_speed} CPM is unusually high",
                    "timestamp": datetime.now().isoformat(),
                }
            )

        if metrics.deletion_rate < 0.01 and metrics.total_keystrokes > 100:
            anomalies.append(
                {
                    "type": "no_errors",
                    "severity": "medium",
                    "description": "Almost no deletion/correction events detected",
                    "timestamp": datetime.now().isoformat(),
                }
            )

        # Multiple contributor probability (sudden changes in typing pattern)
        flight_times = [
            e.flightTime for e in events if e.flightTime > 0 and e.flightTime < 5000
        ]
        if len(flight_times) > 50:
            # Split into quartiles and check variance
            q1 = flight_times[: len(flight_times) // 4]
            q4 = flight_times[-len(flight_times) // 4 :]

            avg_q1 = statistics.mean(q1)
            avg_q4 = statistics.mean(q4)

            change_ratio = (
                abs(avg_q1 - avg_q4) / ((avg_q1 + avg_q4) / 2)
                if (avg_q1 + avg_q4) > 0
                else 0
            )
            multiple_contributor_prob = min(1.0, change_ratio)
        else:
            multiple_contributor_prob = 0.0

        # External assistance probability
        external_assistance_prob = min(
            1.0, (synthetic_score + metrics.paste_count * 10) / 100
        )

        return AuthenticityIndicators(
            human_signature_score=round(human_score, 2),
            synthetic_signature_score=round(synthetic_score, 2),
            consistency_score=round(consistency_score, 2),
            anomaly_flags=anomalies,
            multiple_contributor_probability=round(multiple_contributor_prob, 3),
            external_assistance_probability=round(external_assistance_prob, 3),
        )

    def _analyze_cognitive_process(
        self,
        events: List[KeystrokeSessionEvent],
        metrics: SessionMetrics,
        final_code: str,
    ) -> CognitiveAnalysis:
        """Analyze cognitive process and learning indicators"""

        # Incremental construction vs all-at-once
        incremental = metrics.paste_count < 3 and metrics.total_duration > 300

        # Pivotal moments (large deletions followed by new approach)
        pivotal_moments = []
        for i in range(len(events) - 10):
            window = events[i : i + 10]
            deletions = sum(1 for e in window if "Backspace" in e.key)
            if deletions > 6:  # significant rewrite
                pivotal_moments.append(
                    {
                        "timestamp": window[0].timestamp / 1000,
                        "description": "Significant code rewrite detected",
                        "deletion_count": deletions,
                    }
                )

        # Troubleshooting style
        if len(metrics.friction_points) > 5 and metrics.deletion_rate > 0.2:
            style = "erratic"
        elif len(metrics.friction_points) > 2 and metrics.deletion_rate < 0.15:
            style = "systematic"
        else:
            style = "confident"

        # Cognitive load timeline
        cognitive_load_timeline = []
        window_size = max(50, len(events) // 20)
        for i in range(0, len(events), window_size):
            window = events[i : i + window_size]
            if not window:
                continue

            # High load = long pauses + many deletions
            long_pauses = sum(1 for e in window if e.flightTime > 3000)
            deletions = sum(1 for e in window if "Backspace" in e.key)
            load = min(1.0, (long_pauses * 0.2 + deletions * 0.05))

            cognitive_load_timeline.append(
                {"timestamp": window[0].timestamp / 1000, "load": round(load, 3)}
            )

        # Struggle areas (from friction points)
        struggle_areas = [
            {
                "timestamp": fp["timestamp"] / 1000,
                "duration": fp["duration"],
                "indicator": "High deletion rate and long pauses",
            }
            for fp in metrics.friction_points
        ]

        # Mastery indicators
        mastery = []
        if metrics.average_typing_speed > 150 and metrics.deletion_rate < 0.1:
            mastery.append("Confident typing speed with low error rate")
        if len(pivotal_moments) < 2:
            mastery.append("Minimal need for major rewrites")
        if metrics.total_duration < 600 and metrics.total_keystrokes > 200:
            mastery.append("Efficient problem completion")

        return CognitiveAnalysis(
            incremental_construction=incremental,
            pivotal_moments=pivotal_moments[:5],  # top 5
            troubleshooting_style=style,
            cognitive_load_timeline=cognitive_load_timeline,
            high_friction_concepts=["See friction points for details"],
            struggle_areas=struggle_areas[:5],  # top 5
            mastery_indicators=mastery,
        )

    def _compute_process_score(
        self,
        metrics: SessionMetrics,
        authenticity: AuthenticityIndicators,
        cognitive: CognitiveAnalysis,
    ) -> ProcessScore:
        """Compute overall process quality scores"""

        # Active problem solving (based on cognitive engagement)
        problem_solving = 50.0
        problem_solving += min(25, len(cognitive.pivotal_moments) * 10)
        problem_solving += min(
            25, len(metrics.friction_points) * 5
        )  # friction shows thinking
        problem_solving -= min(20, metrics.paste_count * 5)
        problem_solving = max(0, min(100, problem_solving))

        # Learning depth
        learning_depth = 50.0
        if cognitive.troubleshooting_style == "systematic":
            learning_depth += 20
        if cognitive.incremental_construction:
            learning_depth += 15
        if len(cognitive.mastery_indicators) > 0:
            learning_depth += 15
        learning_depth = max(0, min(100, learning_depth))

        # Authenticity score (inverse of synthetic score)
        authenticity_score = authenticity.human_signature_score

        # Engagement score
        engagement = 50.0
        if metrics.total_duration > 300:
            engagement += 20
        if metrics.total_keystrokes > 200:
            engagement += 20
        if metrics.pause_count > 5:
            engagement += 10  # thinking pauses
        engagement = max(0, min(100, engagement))

        # Overall score
        overall = (
            problem_solving + learning_depth + authenticity_score + engagement
        ) / 4

        # Confidence level
        if authenticity_score > 80 and problem_solving > 70:
            confidence = "HIGH"
        elif authenticity_score > 60 and problem_solving > 50:
            confidence = "MEDIUM"
        else:
            confidence = "LOW"

        return ProcessScore(
            active_problem_solving_score=round(problem_solving, 2),
            learning_depth_score=round(learning_depth, 2),
            authenticity_score=round(authenticity_score, 2),
            engagement_score=round(engagement, 2),
            overall_score=round(overall, 2),
            confidence_level=confidence,
        )

    def _llm_deep_analysis(
        self,
        events: List[KeystrokeSessionEvent],
        metrics: SessionMetrics,
        authenticity: AuthenticityIndicators,
        cognitive: CognitiveAnalysis,
        final_code: str,
    ) -> Dict[str, Any]:
        """Use LLM for deep qualitative analysis"""

        if not self.model:
            return {}

        # Prepare summary for LLM
        summary = self._prepare_llm_summary(
            events, metrics, authenticity, cognitive, final_code
        )

        prompt = f"""You are an expert Behavioral Data Analyst and Educational Strategist analyzing a student coding session.

**Analysis Framework:**
1. Developmental Logic & Iteration
2. Cognitive Load & Behavioral Proxies
3. Authenticity & Pattern Matching
4. Pedagogical Feedback

**Session Data Summary:**
{summary}

**Task:**
Provide a detailed analysis in JSON format with these fields:
{{
  "developmental_logic": "Analysis of incremental vs all-at-once construction",
  "cognitive_insights": "Interpretation of thinking patterns and problem-solving approach",
  "authenticity_assessment": "Evaluation of human vs synthetic signatures",
  "critical_anomalies": ["List of suspicious patterns or red flags"],
  "struggle_concepts": ["Specific concepts where student struggled"],
  "pedagogical_recommendations": ["Specific interventions or support needed"],
  "confidence_assessment": "Overall confidence in authenticity (HIGH/MEDIUM/LOW)",
  "narrative_summary": "2-3 sentence summary of the student's journey"
}}

Respond ONLY with valid JSON, no additional text."""

        try:
            response = self.model.generate_content(prompt)
            result_text = response.text.strip()

            # Extract JSON from markdown code blocks if present
            if "```json" in result_text:
                result_text = result_text.split("```json")[1].split("```")[0].strip()
            elif "```" in result_text:
                result_text = result_text.split("```")[1].split("```")[0].strip()

            analysis = json.loads(result_text)

            # Format for output
            return {
                "llm_analysis": analysis,
                "critical_anomalies": analysis.get("critical_anomalies", []),
                "pedagogical_feedback": {
                    "struggle_concepts": analysis.get("struggle_concepts", []),
                    "recommendations": analysis.get("pedagogical_recommendations", []),
                    "narrative": analysis.get("narrative_summary", ""),
                },
            }
        except Exception as e:
            print(f"⚠️  LLM analysis failed: {e}")
            return {
                "error": str(e),
                "critical_anomalies": [],
                "pedagogical_feedback": {},
            }

    def _prepare_llm_summary(
        self,
        events: List[KeystrokeSessionEvent],
        metrics: SessionMetrics,
        authenticity: AuthenticityIndicators,
        cognitive: CognitiveAnalysis,
        final_code: str,
    ) -> str:
        """Prepare concise summary for LLM analysis"""

        summary = f"""
**Session Metrics:**
- Duration: {metrics.total_duration}s ({metrics.total_duration / 60:.1f} minutes)
- Total Keystrokes: {metrics.total_keystrokes}
- Typing Speed: {metrics.average_typing_speed} CPM
- Deletion Rate: {metrics.deletion_rate * 100:.1f}%
- Paste Operations: {metrics.paste_count}
- Long Pauses (>3s): {metrics.long_pause_count}
- Friction Points: {len(metrics.friction_points)}
- Burst Typing Events: {metrics.burst_typing_events}

**Authenticity Indicators:**
- Human Signature: {authenticity.human_signature_score}/100
- Synthetic Signature: {authenticity.synthetic_signature_score}/100
- External Assistance Probability: {authenticity.external_assistance_probability * 100:.1f}%
- Anomalies: {len(authenticity.anomaly_flags)}

**Cognitive Analysis:**
- Construction Style: {"Incremental" if cognitive.incremental_construction else "All-at-once"}
- Troubleshooting: {cognitive.troubleshooting_style}
- Pivotal Moments: {len(cognitive.pivotal_moments)}
- Struggle Areas: {len(cognitive.struggle_areas)}

**Code Characteristics:**
- Lines of Code: {final_code.count(chr(10)) + 1}
- Characters: {len(final_code)}

**Friction Point Details:**
{json.dumps(metrics.friction_points[:3], indent=2)}

**Cognitive Load Timeline (sample):**
{json.dumps(cognitive.cognitive_load_timeline[:5], indent=2)}
"""
        return summary

    def _rule_based_anomalies(
        self, authenticity: AuthenticityIndicators, metrics: SessionMetrics
    ) -> List[str]:
        """Generate anomalies without LLM"""
        anomalies = []

        if authenticity.synthetic_signature_score > 60:
            anomalies.append(
                f"High synthetic signature score ({authenticity.synthetic_signature_score}/100)"
            )

        if metrics.paste_count > 5:
            anomalies.append(f"Excessive paste operations ({metrics.paste_count})")

        if authenticity.external_assistance_probability > 0.7:
            anomalies.append(
                f"High probability of external assistance ({authenticity.external_assistance_probability * 100:.0f}%)"
            )

        if metrics.average_typing_speed > 400:
            anomalies.append(
                f"Unusually high typing speed ({metrics.average_typing_speed} CPM)"
            )

        return anomalies

    def _basic_pedagogical_feedback(
        self, cognitive: CognitiveAnalysis, metrics: SessionMetrics
    ) -> Dict[str, Any]:
        """Generate basic pedagogical feedback without LLM"""

        return {
            "struggle_concepts": [
                f"Area around timestamp {fp['timestamp'] / 1000:.0f}s with {fp['deletion_rate'] * 100:.0f}% deletion rate"
                for fp in metrics.friction_points[:3]
            ],
            "recommendations": [
                "Review areas with high deletion rates"
                if metrics.deletion_rate > 0.2
                else None,
                "Consider additional practice with incremental development"
                if not cognitive.incremental_construction
                else None,
                "Work on systematic debugging approach"
                if cognitive.troubleshooting_style == "erratic"
                else None,
            ],
            "style": cognitive.troubleshooting_style,
        }


# ==================== Utility Functions ====================


def format_analysis_report(analysis: BehavioralAnalysisResult) -> str:
    """Format analysis result as human-readable report"""

    report = f"""
╔══════════════════════════════════════════════════════════════╗
║           BEHAVIORAL ANALYSIS REPORT                        ║
╚══════════════════════════════════════════════════════════════╝

Student ID: {analysis.student_id}
Session ID: {analysis.session_id}
Analysis Time: {analysis.timestamp.strftime("%Y-%m-%d %H:%M:%S")}

───────────────────────────────────────────────────────────────
📊 SESSION METRICS
───────────────────────────────────────────────────────────────
Duration: {analysis.session_metrics.total_duration}s ({analysis.session_metrics.total_duration / 60:.1f} min)
Total Keystrokes: {analysis.session_metrics.total_keystrokes}
Typing Speed: {analysis.session_metrics.average_typing_speed} CPM
Deletion Rate: {analysis.session_metrics.deletion_rate * 100:.1f}%
Paste Operations: {analysis.session_metrics.paste_count}
Friction Points: {len(analysis.session_metrics.friction_points)}

───────────────────────────────────────────────────────────────
🔍 AUTHENTICITY ASSESSMENT
───────────────────────────────────────────────────────────────
Human Signature: {analysis.authenticity_indicators.human_signature_score}/100
Synthetic Signature: {analysis.authenticity_indicators.synthetic_signature_score}/100
External Assistance Probability: {analysis.authenticity_indicators.external_assistance_probability * 100:.0f}%
Anomaly Flags: {len(analysis.authenticity_indicators.anomaly_flags)}

───────────────────────────────────────────────────────────────
🧠 COGNITIVE ANALYSIS
───────────────────────────────────────────────────────────────
Construction Style: {"Incremental" if analysis.cognitive_analysis.incremental_construction else "All-at-once"}
Troubleshooting: {analysis.cognitive_analysis.troubleshooting_style}
Pivotal Moments: {len(analysis.cognitive_analysis.pivotal_moments)}
Struggle Areas: {len(analysis.cognitive_analysis.struggle_areas)}

───────────────────────────────────────────────────────────────
⭐ PROCESS SCORES
───────────────────────────────────────────────────────────────
Active Problem Solving: {analysis.process_score.active_problem_solving_score}/100
Learning Depth: {analysis.process_score.learning_depth_score}/100
Authenticity: {analysis.process_score.authenticity_score}/100
Engagement: {analysis.process_score.engagement_score}/100
Overall Score: {analysis.process_score.overall_score}/100
Confidence: {analysis.process_score.confidence_level}

───────────────────────────────────────────────────────────────
⚠️  CRITICAL ANOMALIES
───────────────────────────────────────────────────────────────
"""

    if analysis.critical_anomalies:
        for anomaly in analysis.critical_anomalies:
            report += f"• {anomaly}\n"
    else:
        report += "None detected\n"

    report += """
───────────────────────────────────────────────────────────────
📚 PEDAGOGICAL FEEDBACK
───────────────────────────────────────────────────────────────
"""

    feedback = analysis.pedagogical_feedback
    if feedback.get("struggle_concepts"):
        report += "\nStruggle Areas:\n"
        for concept in feedback["struggle_concepts"]:
            report += f"  • {concept}\n"

    if feedback.get("recommendations"):
        report += "\nRecommendations:\n"
        for rec in feedback["recommendations"]:
            if rec:
                report += f"  • {rec}\n"

    report += "\n╚══════════════════════════════════════════════════════════════╝\n"

    return report
