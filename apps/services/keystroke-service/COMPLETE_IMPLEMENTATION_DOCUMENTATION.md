# Keystroke Service - Complete Implementation Documentation

> **Comprehensive Technical Documentation for LLM Analysis and System Integration**
> 
> **Service Version**: 1.0.0  
> **Last Updated**: March 7, 2026  
> **Author**: GradeLoop Core Team

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [Core Components](#core-components)
4. [Implementation Details](#implementation-details)
5. [API Endpoints](#api-endpoints)
6. [Data Models & Structures](#data-models--structures)
7. [Algorithms & Logic](#algorithms--logic)
8. [Integration & Deployment](#integration--deployment)
9. [Configuration & Environment](#configuration--environment)
10. [Testing & Validation](#testing--validation)
11. [Known Issues & Limitations](#known-issues--limitations)
12. [Future Enhancements](#future-enhancements)

---

## 1. Executive Summary

### 1.1 Purpose
The **Keystroke Dynamics Authentication & Behavioral Analysis Service** is a Python-based FastAPI microservice that provides:
- **Behavioral Biometric Authentication**: Continuous user authentication based on typing patterns
- **Academic Integrity Monitoring**: Detection of plagiarism, copy-paste, and AI-assisted coding
- **Cognitive Process Analysis**: Evaluation of learning patterns and problem-solving approaches
- **Pedagogical Insights**: AI-powered feedback for instructors

### 1.2 Technology Stack
- **Framework**: FastAPI 0.104.1 (Python 3.11)
- **ML Model**: TypeNet (PyTorch LSTM-based keystroke dynamics)
- **LLM Integration**: Google Gemini 2.5 Flash
- **Message Queue**: RabbitMQ (Pika 1.3.2)
- **Container**: Docker
- **Port**: 8003 (internal), configurable via environment

### 1.3 Key Capabilities
1. **Real-time Keystroke Capture**: WebSocket and REST API for event collection
2. **User Enrollment**: Biometric template creation from typing samples
3. **Verification (1:1)**: Authenticate claimed identity
4. **Identification (1:N)**: Identify user from typing pattern
5. **Continuous Monitoring**: Session-based risk assessment
6. **Behavioral Analysis**: Comprehensive session analysis with LLM insights
7. **Event Publishing**: RabbitMQ integration for authentication events

---

## 2. Architecture Overview

### 2.1 System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Layer                            │
│  • Web Frontend (React/Next.js)                                 │
│  • Keystroke Capture JavaScript                                 │
│  • WebSocket Client                                             │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTP/WebSocket
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API Gateway (Go)                           │
│  • JWT Authentication                                           │
│  • Route: /api/keystroke/*                                      │
│  • CORS Handling                                                │
└──────────────────────────┬──────────────────────────────────────┘
                           │ Proxy to Port 8003
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│              Keystroke Service (FastAPI - Python)               │
│                                                                 │
│  ┌─────────────────┐  ┌──────────────────┐  ┌───────────────┐ │
│  │   main.py       │  │ feature_         │  │ typenet_      │ │
│  │   (FastAPI App) │  │ extraction.py    │  │ inference.py  │ │
│  │   - REST API    │  │ - Feature Eng.   │  │ - TypeNet ML  │ │
│  │   - WebSocket   │  │ - Preprocessing  │  │ - Auth Logic  │ │
│  └─────────────────┘  └──────────────────┘  └───────────────┘ │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │         behavioral_analysis.py                          │   │
│  │  - Session Metrics Computation                          │   │
│  │  - Authenticity Detection                               │   │
│  │  - Cognitive Analysis                                   │   │
│  │  - LLM Integration (Gemini)                             │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌────────────┐  ┌──────────────┐  ┌────────────────────┐     │
│  │ Session    │  │ User         │  │ TypeNet Model      │     │
│  │ Storage    │  │ Templates    │  │ (typenet_pre       │     │
│  │ (In-Memory)│  │ (Pickle PKL) │  │  trained.pth)      │     │
│  └────────────┘  └──────────────┘  └────────────────────┘     │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ├──> RabbitMQ (Auth Events)
                           └──> Google Gemini API (LLM Analysis)
```

### 2.2 Data Flow

#### Authentication Flow
```
1. User Types → Keystroke Events Captured
2. Events Sent → POST /api/keystroke/capture
3. Events Buffered → In-Memory Session Storage
4. Threshold Reached → Sequence Creation (70 keystrokes)
5. Feature Extraction → TypeNet Input Format [HL, IL, PL, RL, KeyCode]
6. Model Inference → 128-dimensional Embedding
7. Similarity Computation → Cosine Similarity vs Template
8. Risk Assessment → Authentication Decision
9. Event Publish → RabbitMQ for downstream services
```

#### Behavioral Analysis Flow
```
1. Coding Session Complete → All Keystroke Events + Final Code
2. POST /api/keystroke/analyze
3. Metrics Computation → Speed, Pauses, Deletions, Friction Points
4. Authenticity Analysis → Human vs Synthetic Signatures
5. Cognitive Analysis → Incremental Construction, Pivotal Moments
6. LLM Deep Analysis → Gemini API (Qualitative Insights)
7. Report Generation → Comprehensive Analysis + Pedagogical Feedback
```

---

## 3. Core Components

### 3.1 Main Application (`main.py`)

**File**: `apps/services/keystroke-service/main.py`  
**Lines of Code**: 633  
**Purpose**: FastAPI application with REST and WebSocket endpoints

#### Key Sections:

##### 3.1.1 Imports & Initialization
```python
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pika  # RabbitMQ
import google.generativeai as genai  # LLM

# Initialize components
feature_extractor = KeystrokeFeatureExtractor()
authenticator = TypeNetAuthenticator(model_path, device='cpu')
behavioral_analyzer = BehavioralAnalyzer()
```

##### 3.1.2 Global State
```python
# In-memory session storage (replace with Redis in production)
active_sessions = {}  # Format: {user_id:session_id: {events, risk_score, last_verification}}

# User templates loaded from pickle file
authenticator.user_templates  # {user_id: {template, std, sample_count}}
```

##### 3.1.3 RabbitMQ Integration
```python
RABBITMQ_HOST = os.getenv('RABBITMQ_HOST', 'localhost')
RABBITMQ_EXCHANGE = 'keystroke.exchange'
RABBITMQ_ROUTING_KEY = 'keystroke.auth.result'

def publish_auth_event(event_data: dict):
    """Publishes authentication results to RabbitMQ exchange"""
    # Creates persistent messages with delivery_mode=2
    # Non-blocking error handling
```

**Published Event Structure**:
```json
{
  "studentId": "string",
  "assignmentId": "string",
  "courseId": "string",
  "sessionId": "string",
  "confidenceLevel": 85.5,  // 0-100
  "riskScore": 14.5,         // 0-100
  "keystrokeSampleSize": 150,
  "timestamp": "2026-03-07T12:00:00",
  "authenticated": true,
  "similarityScore": 85.5,   // 0-100
  "metadata": "{\"threshold\":0.7}"
}
```

---

### 3.2 Feature Extraction (`feature_extraction.py`)

**File**: `apps/services/keystroke-service/feature_extraction.py`  
**Lines of Code**: 219  
**Purpose**: Transform raw keystroke events into ML-ready features

#### 3.2.1 KeystrokeFeatureExtractor Class

##### Method: `extract_features(keystroke_events: List[Dict]) -> np.ndarray`
**Returns**: Fixed-size feature vector (23 features)

**Feature Categories**:
1. **Dwell Time Statistics** (5 features):
   - Mean, Std, Median, 25th percentile, 75th percentile

2. **Flight Time Statistics** (5 features):
   - Mean, Std, Median, 25th percentile, 75th percentile

3. **Typing Speed** (1 feature):
   - Characters per second

4. **Error Patterns** (1 feature):
   - Backspace/Delete frequency

5. **Special Keys** (1 feature):
   - Shift/Control/Alt usage rate

6. **Digraph Timing** (5 features):
   - Average timing for top 5 common two-key sequences

7. **Pause Patterns** (1 feature):
   - Long pause (>500ms) frequency

**Implementation**:
```python
def extract_features(self, keystroke_events: List[Dict]) -> np.ndarray:
    dwell_times = [e['dwellTime'] for e in keystroke_events if e['dwellTime'] > 0]
    features = [
        np.mean(dwell_times),
        np.std(dwell_times),
        np.median(dwell_times),
        np.percentile(dwell_times, 25),
        np.percentile(dwell_times, 75)
    ]
    # ... (continues for all 23 features)
    return np.array(features, dtype=np.float32)
```

##### Method: `create_typenet_sequence(keystroke_events, sequence_length=70) -> np.ndarray`
**Returns**: (70, 5) array for TypeNet model

**TypeNet Features** (per keystroke):
1. **HL (Hold Latency)**: Dwell time (key press to release)
2. **IL (Inter-key Latency)**: Flight time (previous release to current press)
3. **PL (Press Latency)**: Time from previous press to current press
4. **RL (Release Latency)**: Time from previous release to current release
5. **KeyCode**: Normalized key code (0-1 range)

**Implementation**:
```python
def create_typenet_sequence(self, keystroke_events, sequence_length=70):
    # Pad or truncate to exactly 70 keystrokes
    if len(keystroke_events) > sequence_length:
        events = keystroke_events[-sequence_length:]
    else:
        events = keystroke_events + [keystroke_events[-1]] * (sequence_length - len(keystroke_events))
    
    sequence = []
    for i, event in enumerate(events):
        hl = event['dwellTime'] / 1000.0  # Convert ms to seconds
        il = event['flightTime'] / 1000.0
        pl = (events[i]['timestamp'] - events[i-1]['timestamp']) / 1000.0 if i > 0 else 0
        rl = calculate_release_latency(events, i)
        keycode = event['keyCode'] / 255.0  # Normalize
        
        sequence.append([hl, il, pl, rl, keycode])
    
    return np.array(sequence, dtype=np.float32)  # Shape: (70, 5)
```

---

### 3.3 TypeNet Authenticator (`typenet_inference.py`)

**File**: `apps/services/keystroke-service/typenet_inference.py`  
**Lines of Code**: 398  
**Purpose**: LSTM-based keystroke dynamics authentication

#### 3.3.1 TypeNet Neural Network Architecture

**Model Structure**:
```
Input: (batch_size, 70, 5)
    ↓
LSTM Layer 1 (hidden_size=128)
    ↓
BatchNorm1d + Dropout(0.5)
    ↓
LSTM Layer 2 (hidden_size=128)
    ↓
BatchNorm1d + Dropout(0.5)
    ↓
Take Last Timestep: (batch_size, 128)
    ↓
Fully Connected: (batch_size, 128)
    ↓
Output Embedding: 128-dimensional vector
```

**Training Details** (from `train_model.py`):
- **Loss Function**: Triplet Loss (margin=1.5)
- **Optimizer**: Adam (learning_rate=0.005)
- **Batch Size**: 512
- **Epochs**: 100
- **Training Data**: Aalto University keystroke dataset
- **Triplet Sampling**: Anchor (user A), Positive (same user, different sequence), Negative (different user)

**PyTorch Implementation**:
```python
class TypeNet(nn.Module):
    def __init__(self, input_size=5, hidden_size=128, output_size=128, dropout_rate=0.5):
        super(TypeNet, self).__init__()
        self.lstm1 = nn.LSTM(input_size, hidden_size, batch_first=True)
        self.bn1 = nn.BatchNorm1d(hidden_size)
        self.dropout1 = nn.Dropout(dropout_rate)
        self.lstm2 = nn.LSTM(hidden_size, hidden_size, batch_first=True)
        self.bn2 = nn.BatchNorm1d(hidden_size)
        self.dropout2 = nn.Dropout(dropout_rate)
        self.fc = nn.Linear(hidden_size, output_size)
    
    def forward(self, x):
        out, _ = self.lstm1(x)
        out = out.permute(0, 2, 1)
        out = self.bn1(out)
        out = out.permute(0, 2, 1)
        out = self.dropout1(out)
        
        out, _ = self.lstm2(out)
        out = out.permute(0, 2, 1)
        out = self.bn2(out)
        out = out.permute(0, 2, 1)
        out = self.dropout2(out)
        
        last_timestep = out[:, -1, :]
        embedding = self.fc(last_timestep)
        return embedding
```

#### 3.3.2 TypeNetAuthenticator Class Methods

##### Method: `enroll_user(user_id, keystroke_sequences) -> Dict`
**Purpose**: Create biometric template from multiple typing samples

**Requirements**:
- Minimum 3 sequences (each 70 keystrokes)
- Each sequence shape: (70, 5)

**Algorithm**:
1. Generate embeddings for all sequences
2. Compute mean embedding (template)
3. Compute standard deviation (variation measure)
4. Store template in memory and save to disk

```python
def enroll_user(self, user_id, keystroke_sequences):
    embeddings = [self.get_embedding(seq) for seq in keystroke_sequences]
    template = np.mean(embeddings, axis=0)  # Shape: (128,)
    template_std = np.std(embeddings, axis=0)
    
    self.user_templates[user_id] = {
        'template': template,
        'std': template_std,
        'sample_count': len(embeddings)
    }
    
    self.save_templates('models/user_templates.pkl')
```

##### Method: `verify_user(user_id, keystroke_sequence, threshold=0.7) -> Dict`
**Purpose**: Verify if typing pattern matches claimed identity (1:1 matching)

**Algorithm**:
1. Get embedding from input sequence
2. Retrieve user's stored template
3. Compute cosine similarity
4. Compare against threshold
5. Return authentication decision

**Cosine Similarity Formula**:
```
similarity = (embedding · template) / (||embedding|| × ||template||)
risk_score = 1 - similarity
authenticated = similarity >= threshold
```

**Return Structure**:
```python
{
    'success': True,
    'authenticated': True/False,
    'user_id': 'student_001',
    'similarity': 0.85,      # 0-1
    'risk_score': 0.15,      # 0-1
    'threshold': 0.7,
    'message': 'Authenticated' or 'Authentication failed'
}
```

##### Method: `identify_user(keystroke_sequence, top_k=3) -> Dict`
**Purpose**: Identify user from typing pattern (1:N matching)

**Algorithm**:
1. Get embedding from input sequence
2. Compare against ALL enrolled user templates
3. Sort by similarity (highest first)
4. Return top K matches with confidence levels

**Confidence Levels**:
- HIGH: similarity ≥ 0.8
- MEDIUM: 0.6 ≤ similarity < 0.8
- LOW: similarity < 0.6

**Return Structure**:
```python
{
    'success': True,
    'matches': [
        {'userId': 'student_001', 'similarity': 0.85, 'confidence': 85.0, 'rank': 1},
        {'userId': 'student_042', 'similarity': 0.72, 'confidence': 72.0, 'rank': 2},
        {'userId': 'student_015', 'similarity': 0.68, 'confidence': 68.0, 'rank': 3}
    ],
    'best_match': {'userId': 'student_001', ...},
    'confidence_level': 'HIGH',
    'total_enrolled_users': 150
}
```

##### Method: `continuous_authentication(user_id, sequences) -> Dict` ⚠️ **MISSING IMPLEMENTATION**
**Status**: Called in `main.py` line 409 but NOT implemented in `typenet_inference.py`

**Expected Behavior** (inferred from usage):
```python
def continuous_authentication(self, user_id, sequences):
    """
    Verify user across multiple recent sequences for continuous monitoring
    
    Args:
        user_id: User to verify
        sequences: List of recent sequences (e.g., last 5)
    
    Returns:
        {
            'status': 'AUTHENTICATED' | 'SUSPICIOUS' | 'REJECTED',
            'average_risk_score': 0.15,
            'verification_count': 5,
            'individual_scores': [0.12, 0.15, 0.18, 0.13, 0.14]
        }
    """
    # **NEEDS TO BE IMPLEMENTED**
    pass
```

**Recommended Implementation**:
```python
def continuous_authentication(self, user_id: str, sequences: List[np.ndarray]) -> Dict:
    if user_id not in self.user_templates:
        return {'status': 'ERROR', 'message': 'User not enrolled'}
    
    risk_scores = []
    for sequence in sequences:
        result = self.verify_user(user_id, sequence, threshold=0.7)
        if result['success']:
            risk_scores.append(result['risk_score'])
    
    if not risk_scores:
        return {'status': 'ERROR', 'message': 'No valid sequences'}
    
    avg_risk = np.mean(risk_scores)
    
    if avg_risk < 0.3:
        status = 'AUTHENTICATED'
    elif avg_risk < 0.6:
        status = 'SUSPICIOUS'
    else:
        status = 'REJECTED'
    
    return {
        'status': status,
        'average_risk_score': float(avg_risk),
        'verification_count': len(risk_scores),
        'individual_scores': [float(r) for r in risk_scores]
    }
```

---

### 3.4 Behavioral Analysis Engine (`behavioral_analysis.py`)

**File**: `apps/services/keystroke-service/behavioral_analysis.py`  
**Lines of Code**: 718  
**Purpose**: Comprehensive cognitive and authenticity analysis with LLM integration

#### 3.4.1 Data Models (Pydantic)

##### KeystrokeSessionEvent
```python
class KeystrokeSessionEvent(BaseModel):
    timestamp: float        # milliseconds since session start
    key: str               # Key pressed
    keyCode: int           # Numeric key code
    dwellTime: float       # Time key was held down (ms)
    flightTime: float      # Time between this key and previous (ms)
    action: str            # 'type', 'delete', 'paste', 'copy'
    lineNumber: Optional[int]
    columnNumber: Optional[int]
    codeSnapshot: Optional[str]  # Code state at this moment
```

##### SessionMetrics
```python
class SessionMetrics(BaseModel):
    total_duration: int                    # seconds
    total_keystrokes: int
    average_typing_speed: float           # CPM (characters per minute)
    pause_count: int                      # pauses > 1 second
    long_pause_count: int                 # pauses > 3 seconds
    deletion_count: int
    deletion_rate: float                  # 0-1
    paste_count: int
    copy_count: int
    avg_dwell_time: float
    std_dwell_time: float
    avg_flight_time: float
    std_flight_time: float
    burst_typing_events: int              # very fast typing (< 100ms)
    rhythm_consistency: float             # 0-1 (inverse of CV)
    friction_points: List[Dict[str, Any]] # moments of struggle
```

##### AuthenticityIndicators
```python
class AuthenticityIndicators(BaseModel):
    human_signature_score: float                  # 0-100
    synthetic_signature_score: float              # 0-100
    consistency_score: float                      # 0-100
    anomaly_flags: List[Dict[str, Any]]
    multiple_contributor_probability: float       # 0-1
    external_assistance_probability: float        # 0-1
```

##### CognitiveAnalysis
```python
class CognitiveAnalysis(BaseModel):
    incremental_construction: bool
    pivotal_moments: List[Dict[str, Any]]
    troubleshooting_style: str  # 'systematic', 'erratic', 'confident'
    cognitive_load_timeline: List[Dict[str, float]]
    high_friction_concepts: List[str]
    struggle_areas: List[Dict[str, Any]]
    mastery_indicators: List[str]
```

##### ProcessScore
```python
class ProcessScore(BaseModel):
    active_problem_solving_score: float  # 0-100
    learning_depth_score: float          # 0-100
    authenticity_score: float            # 0-100
    engagement_score: float              # 0-100
    overall_score: float                 # 0-100
    confidence_level: str  # 'HIGH', 'MEDIUM', 'LOW'
```

##### BehavioralAnalysisResult
```python
class BehavioralAnalysisResult(BaseModel):
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
```

#### 3.4.2 BehavioralAnalyzer Class

##### Initialization
```python
class BehavioralAnalyzer:
    def __init__(self, gemini_api_key: Optional[str] = None):
        self.gemini_api_key = gemini_api_key or os.getenv('GEMINI_API_KEY')
        if self.gemini_api_key:
            genai.configure(api_key=self.gemini_api_key)
            self.model = genai.GenerativeModel('gemini-2.5-flash')
        else:
            self.model = None
            # Falls back to rule-based analysis
```

##### Method: `analyze_session() -> BehavioralAnalysisResult`
**Main Entry Point**: Orchestrates entire analysis pipeline

**Pipeline Steps**:
1. Compute Session Metrics (`_compute_session_metrics`)
2. Analyze Authenticity (`_analyze_authenticity`)
3. Cognitive Analysis (`_analyze_cognitive_process`)
4. Process Scoring (`_compute_process_score`)
5. LLM Deep Analysis (`_llm_deep_analysis` or fallback)

##### Method: `_compute_session_metrics(events) -> SessionMetrics`
**Algorithm Overview**:

**1. Duration & Typing Speed**:
```python
total_duration = (events[-1].timestamp - events[0].timestamp) / 1000  # seconds
typing_chars = sum(1 for e in events if len(e.key) == 1 and e.action == 'type')
average_typing_speed = (typing_chars / total_duration * 60)  # CPM
```

**2. Pause Detection**:
```python
flight_times = [e.flightTime for e in events if e.flightTime > 0]
pause_count = sum(1 for ft in flight_times if ft > 1000)  # > 1 second
long_pause_count = sum(1 for ft in flight_times if ft > 3000)  # > 3 seconds
```

**3. Deletion Analysis**:
```python
deletion_count = sum(1 for e in events if 'Backspace' in e.key or 'Delete' in e.key)
deletion_rate = deletion_count / total_keystrokes
```

**4. Rhythm Consistency**:
```python
# Coefficient of Variation inverse
rhythm_consistency = 1 - (std_flight / avg_flight) if avg_flight > 0 else 0
rhythm_consistency = max(0, min(1, rhythm_consistency))
```

**5. Friction Point Detection**:
```python
def _identify_friction_points(events):
    """Sliding window analysis (50-keystroke windows with 50% overlap)"""
    friction_points = []
    window_size = 50
    
    for i in range(0, len(events) - window_size, window_size // 2):
        window = events[i:i + window_size]
        deletions = sum(1 for e in window if 'Backspace' in e.key)
        long_pauses = sum(1 for e in window if e.flightTime > 3000)
        deletion_rate = deletions / len(window)
        
        if deletion_rate > 0.3 or long_pauses > 2:  # High friction threshold
            friction_points.append({
                'timestamp': window[0].timestamp,
                'duration': (window[-1].timestamp - window[0].timestamp) / 1000,
                'deletion_rate': deletion_rate,
                'long_pauses': long_pauses,
                'severity': 'high' if deletion_rate > 0.5 else 'medium'
            })
    
    return friction_points
```

##### Method: `_analyze_authenticity() -> AuthenticityIndicators`
**Goal**: Distinguish human from synthetic/copied/AI-generated code

**Human Signature Score** (0-100):
```python
human_score = 50.0  # Baseline

# Natural errors increase score
human_score += min(30, metrics.deletion_rate * 100)

# Struggle indicates genuine effort
human_score += min(20, len(metrics.friction_points) * 5)

# Excessive burst typing decreases (too perfect)
human_score -= min(20, metrics.burst_typing_events / 10)

human_score = max(0, min(100, human_score))
```

**Synthetic Signature Score** (0-100):
```python
synthetic_score = 0.0

if metrics.paste_count > 5:
    synthetic_score += 30  # Excessive paste operations

if metrics.deletion_rate < 0.02:
    synthetic_score += 25  # Too few errors (almost perfect)

if metrics.burst_typing_events > 100:
    synthetic_score += 25  # Machine-like consistency

if metrics.pause_count < 3:
    synthetic_score += 20  # No thinking pauses

synthetic_score = min(100, synthetic_score)
```

**Anomaly Detection**:
```python
anomalies = []

if metrics.paste_count > 3:
    anomalies.append({
        'type': 'excessive_paste',
        'severity': 'high',
        'description': f'Detected {metrics.paste_count} paste operations'
    })

if metrics.average_typing_speed > 500:
    anomalies.append({
        'type': 'superhuman_speed',
        'severity': 'critical',
        'description': f'Typing speed {metrics.average_typing_speed} CPM is unusually high'
    })

if metrics.deletion_rate < 0.01 and metrics.total_keystrokes > 100:
    anomalies.append({
        'type': 'no_errors',
        'severity': 'medium',
        'description': 'Almost no deletion/correction events detected'
    })
```

**Multiple Contributor Detection**:
```python
# Detect sudden pattern changes (typing rhythm shifts)
flight_times = [e.flightTime for e in events if 0 < e.flightTime < 5000]
q1 = flight_times[:len(flight_times)//4]      # First quartile
q4 = flight_times[-len(flight_times)//4:]     # Last quartile

avg_q1 = statistics.mean(q1)
avg_q4 = statistics.mean(q4)

change_ratio = abs(avg_q1 - avg_q4) / ((avg_q1 + avg_q4) / 2)
multiple_contributor_prob = min(1.0, change_ratio)
```

##### Method: `_analyze_cognitive_process() -> CognitiveAnalysis`
**Goal**: Understand learning patterns and problem-solving approach

**1. Incremental vs All-at-Once**:
```python
incremental = metrics.paste_count < 3 and metrics.total_duration > 300
```

**2. Pivotal Moments** (major code rewrites):
```python
for i in range(len(events) - 10):
    window = events[i:i + 10]
    deletions = sum(1 for e in window if 'Backspace' in e.key)
    if deletions > 6:  # Significant rewrite
        pivotal_moments.append({
            'timestamp': window[0].timestamp / 1000,
            'description': 'Significant code rewrite detected',
            'deletion_count': deletions
        })
```

**3. Troubleshooting Style Classification**:
```python
if len(friction_points) > 5 and deletion_rate > 0.2:
    style = 'erratic'       # Many struggles, high error rate
elif len(friction_points) > 2 and deletion_rate < 0.15:
    style = 'systematic'    # Some struggles, controlled errors
else:
    style = 'confident'     # Minimal struggles
```

**4. Cognitive Load Timeline**:
```python
# Sliding window (e.g., 50-keystroke windows)
for i in range(0, len(events), window_size):
    window = events[i:i + window_size]
    long_pauses = sum(1 for e in window if e.flightTime > 3000)
    deletions = sum(1 for e in window if 'Backspace' in e.key)
    
    # High load = long pauses + many deletions
    load = min(1.0, (long_pauses * 0.2 + deletions * 0.05))
    
    cognitive_load_timeline.append({
        'timestamp': window[0].timestamp / 1000,
        'load': load
    })
```

##### Method: `_llm_deep_analysis() -> Dict`
**LLM**: Google Gemini 2.5 Flash

**Prompt Structure**:
```python
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

Respond ONLY with valid JSON, no additional text.
"""
```

**Summary Format**:
```
**Session Metrics:**
- Duration: 1200s (20.0 minutes)
- Total Keystrokes: 450
- Typing Speed: 180 CPM
- Deletion Rate: 15.2%
- Paste Operations: 1
- Long Pauses (>3s): 5
- Friction Points: 3
- Burst Typing Events: 25

**Authenticity Indicators:**
- Human Signature: 85/100
- Synthetic Signature: 20/100
- External Assistance Probability: 15.0%
- Anomalies: 0

**Cognitive Analysis:**
- Construction Style: Incremental
- Troubleshooting: systematic
- Pivotal Moments: 2
- Struggle Areas: 3

**Code Characteristics:**
- Lines of Code: 15
- Characters: 200

**Friction Point Details:**
[Details of top 3 friction points]

**Cognitive Load Timeline (sample):**
[First 5 timeline entries]
```

**Error Handling**:
```python
try:
    response = self.model.generate_content(prompt)
    result_text = response.text.strip()
    
    # Extract JSON from markdown code blocks if present
    if '```json' in result_text:
        result_text = result_text.split('```json')[1].split('```')[0].strip()
    
    analysis = json.loads(result_text)
    return analysis
    
except Exception as e:
    print(f"⚠️  LLM analysis failed: {e}")
    return self._rule_based_anomalies()  # Fallback
```

---

## 4. Implementation Details

### 4.1 Session Management

**Storage Structure** (In-Memory):
```python
active_sessions = {
    "student_001:session_abc123": {
        "events": [...],  # List of keystroke events (max 500 recent)
        "last_verification": "2026-03-07T12:30:00",
        "risk_score": 0.15
    }
}
```

**Session Lifecycle**:
1. **Creation**: Automatic on first keystroke capture
2. **Updates**: Events appended, circular buffer (last 500)
3. **Monitoring**: Periodic verification every 150 keystrokes
4. **Termination**: Manual via DELETE endpoint or timeout

**Limitations**:
- ⚠️ In-memory storage = data lost on restart
- ⚠️ No persistence across service restarts
- ⚠️ Not suitable for horizontal scaling
- 💡 **Production Recommendation**: Replace with Redis

### 4.2 User Template Persistence

**Storage Method**: Pickle serialization

**File**: `models/user_templates.pkl`

**Structure**:
```python
{
    "student_001": {
        "template": np.array([...]),  # 128-dimensional embedding
        "std": np.array([...]),        # Standard deviation
        "sample_count": 5
    },
    "student_002": {...}
}
```

**Operations**:
- **Save**: After each enrollment (`authenticator.save_templates()`)
- **Load**: On service startup
- **Update**: Automatic on new enrollment

**Limitations**:
- ⚠️ Not concurrent-safe (file locking issues)
- ⚠️ No versioning or backup
- 💡 **Production Recommendation**: Use PostgreSQL or MongoDB

### 4.3 WebSocket Real-Time Monitoring

**Endpoint**: `WS /ws/monitor/{user_id}/{session_id}`

**Flow**:
```python
@app.websocket("/ws/monitor/{user_id}/{session_id}")
async def websocket_monitor(websocket: WebSocket, user_id: str, session_id: str):
    await websocket.accept()
    
    try:
        while True:
            await asyncio.sleep(5)  # Check every 5 seconds
            
            if session_key in active_sessions:
                session_data = active_sessions[session_key]
                
                # Send status update
                await websocket.send_json({
                    "type": "status_update",
                    "user_id": user_id,
                    "session_id": session_id,
                    "risk_score": session_data['risk_score'],
                    "events_captured": len(session_data['events']),
                    "timestamp": datetime.now().isoformat()
                })
                
                # Alert on high risk
                if session_data['risk_score'] > 0.7:
                    await websocket.send_json({
                        "type": "alert",
                        "level": "HIGH",
                        "message": "Potential impersonation detected!",
                        "risk_score": session_data['risk_score']
                    })
    
    except WebSocketDisconnect:
        print(f"WebSocket disconnected for {session_key}")
```

---

## 5. API Endpoints

### 5.1 Health & Info

#### GET `/health`
**Purpose**: Container health check  
**Auth**: None  
**Response**:
```json
{
  "status": "healthy",
  "service": "keystroke-service",
  "version": "1.0.0"
}
```

#### GET `/`
**Purpose**: Service information and endpoint listing  
**Auth**: None  
**Response**:
```json
{
  "service": "Keystroke Dynamics Authentication",
  "status": "running",
  "version": "1.0.0",
  "endpoints": {
    "capture": "/api/keystroke/capture",
    "enroll": "/api/keystroke/enroll",
    "verify": "/api/keystroke/verify",
    "identify": "/api/keystroke/identify",
    "monitor": "/api/keystroke/monitor",
    "enrolled_users": "/api/keystroke/users/enrolled"
  }
}
```

### 5.2 Keystroke Capture

#### POST `/api/keystroke/capture`
**Purpose**: Capture keystroke events for session buffering  
**Auth**: JWT (via API Gateway)

**Request Body**:
```json
{
  "events": [
    {
      "userId": "student_001",
      "sessionId": "session_abc123",
      "timestamp": 1234567890,
      "key": "a",
      "dwellTime": 80,
      "flightTime": 120,
      "keyCode": 65
    }
  ]
}
```

**Response**:
```json
{
  "success": true,
  "captured": 50,
  "total_buffered": 250
}
```

**Implementation Notes**:
- Initializes session storage if first event
- Appends events to circular buffer (max 500)
- Returns total buffered count

### 5.3 User Enrollment

#### POST `/api/keystroke/enroll`
**Purpose**: Create biometric template from typing samples  
**Auth**: JWT

**Requirements**:
- Minimum 150 keystroke events
- Recommended: 200-300 events for better accuracy

**Request Body**:
```json
{
  "userId": "student_001",
  "keystrokeEvents": [
    {"timestamp": 0, "key": "h", "dwellTime": 80, "flightTime": 0, "keyCode": 72},
    {"timestamp": 150, "key": "e", "dwellTime": 75, "flightTime": 70, "keyCode": 69}
    // ... at least 150 events
  ]
}
```

**Response**:
```json
{
  "success": true,
  "user_id": "student_001",
  "sequences_created": 5,
  "enrollment_complete": true,
  "message": "User enrolled successfully. Authentication is now active."
}
```

**Error Cases**:
- `400`: Insufficient data (< 150 events)
- `400`: Could not create enough sequences (< 3)
- `500`: Internal error

**Processing**:
1. Split events into 70-keystroke sequences (50% overlap)
2. Create TypeNet sequences (70 × 5 features)
3. Generate embeddings
4. Compute mean template
5. Save to disk (`user_templates.pkl`)

### 5.4 User Verification

#### POST `/api/keystroke/verify`
**Purpose**: Verify claimed identity (1:1 matching)  
**Auth**: JWT

**Request Body**:
```json
{
  "userId": "student_001",
  "keystrokeEvents": [
    // At least 70 keystroke events
  ],
  "threshold": 0.7,
  "assignmentId": "assignment_123",
  "courseId": "course_456"
}
```

**Response**:
```json
{
  "success": true,
  "authenticated": true,
  "user_id": "student_001",
  "similarity": 0.85,
  "risk_score": 0.15,
  "threshold": 0.7,
  "message": "Authenticated"
}
```

**Side Effects**:
- Publishes authentication event to RabbitMQ

**Threshold Guidelines**:
- **0.8+**: Very high confidence
- **0.7-0.8**: High confidence (default)
- **0.6-0.7**: Medium confidence
- **< 0.6**: Low confidence (reject)

### 5.5 User Identification

#### POST `/api/keystroke/identify`
**Purpose**: Identify user from typing pattern (1:N matching)  
**Auth**: JWT

**Request Body**:
```json
{
  "keystrokeEvents": [
    // At least 70 keystroke events
  ],
  "topK": 3
}
```

**Response**:
```json
{
  "success": true,
  "matches": [
    {"userId": "student_001", "similarity": 0.85, "confidence": 85.0, "rank": 1},
    {"userId": "student_042", "similarity": 0.72, "confidence": 72.0, "rank": 2},
    {"userId": "student_015", "similarity": 0.68, "confidence": 68.0, "rank": 3}
  ],
  "best_match": {"userId": "student_001", "similarity": 0.85, "confidence": 85.0, "rank": 1},
  "confidence_level": "HIGH",
  "total_enrolled_users": 150,
  "message": "Identified with HIGH confidence"
}
```

**Use Cases**:
- Detect impersonation attempts
- Anonymous submission attribution
- Cross-reference authentication

### 5.6 Continuous Monitoring

#### POST `/api/keystroke/monitor`
**Purpose**: Continuous authentication on active session  
**Auth**: JWT

**Request Body**:
```json
{
  "userId": "student_001",
  "sessionId": "session_abc123",
  "assignmentId": "assignment_123",
  "courseId": "course_456"
}
```

**Response (Collecting Data)**:
```json
{
  "success": true,
  "status": "COLLECTING_DATA",
  "message": "Collecting baseline data. 120/150 events captured.",
  "risk_score": 0.0
}
```

**Response (Monitoring Active)**:
```json
{
  "success": true,
  "status": "AUTHENTICATED",
  "average_risk_score": 0.15,
  "verification_count": 5,
  "individual_scores": [0.12, 0.15, 0.18, 0.13, 0.14],
  "message": "User authenticated with low risk"
}
```

**Status Codes**:
- `COLLECTING_DATA`: < 150 events captured
- `AUTHENTICATED`: Low risk (< 0.3)
- `SUSPICIOUS`: Medium risk (0.3-0.6)
- `REJECTED`: High risk (> 0.6)

**Side Effects**:
- Publishes continuous auth event to RabbitMQ
- Updates session risk score

### 5.7 Session Management

#### GET `/api/keystroke/session/status/{user_id}/{session_id}`
**Purpose**: Get current session status  
**Auth**: JWT

**Response**:
```json
{
  "success": true,
  "user_id": "student_001",
  "session_id": "session_abc123",
  "events_captured": 250,
  "last_verification": "2026-03-07T12:30:00",
  "current_risk_score": 0.15
}
```

#### DELETE `/api/keystroke/session/{user_id}/{session_id}`
**Purpose**: End session and cleanup  
**Auth**: JWT

**Response**:
```json
{
  "success": true,
  "message": "Session ended"
}
```

### 5.8 Behavioral Analysis

#### POST `/api/keystroke/analyze`
**Purpose**: Comprehensive behavioral analysis of coding session  
**Auth**: JWT

**Request Body**:
```json
{
  "sessionId": "session_001",
  "studentId": "student_001",
  "events": [
    {
      "timestamp": 0,
      "key": "d",
      "keyCode": 100,
      "dwellTime": 80,
      "flightTime": 120,
      "action": "type",
      "lineNumber": 1,
      "columnNumber": 1
    }
    // ... all events
  ],
  "finalCode": "def bubble_sort(arr):\n    ...",
  "includeReport": true
}
```

**Response** (abbreviated):
```json
{
  "success": true,
  "analysis": {
    "session_id": "session_001",
    "student_id": "student_001",
    "timestamp": "2026-03-07T12:00:00",
    "session_metrics": {
      "total_duration": 1200,
      "average_typing_speed": 180,
      "deletion_rate": 0.15,
      "friction_points": [...]
    },
    "authenticity_indicators": {
      "human_signature_score": 85.5,
      "synthetic_signature_score": 20.3,
      "anomaly_flags": []
    },
    "cognitive_analysis": {
      "incremental_construction": true,
      "troubleshooting_style": "systematic"
    },
    "process_score": {
      "overall_score": 82.5,
      "confidence_level": "HIGH"
    },
    "critical_anomalies": [],
    "pedagogical_feedback": {
      "struggle_concepts": [...],
      "recommendations": [...]
    },
    "formatted_report": "..."  // If includeReport=true
  }
}
```

#### GET `/api/keystroke/analyze/config`
**Purpose**: Get analysis configuration  
**Auth**: JWT

**Response**:
```json
{
  "success": true,
  "config": {
    "llm_enabled": true,
    "llm_model": "gemini-2.5-flash",
    "analysis_features": [
      "Developmental Logic & Iteration",
      "Cognitive Load Analysis",
      "Authenticity Detection",
      "Pedagogical Feedback"
    ],
    "metrics_tracked": [
      "Typing speed",
      "Pause patterns",
      "Deletion rate",
      "Copy/paste detection",
      "Friction points",
      "Cognitive load timeline"
    ]
  }
}
```

### 5.9 User Management

#### GET `/api/keystroke/users/enrolled`
**Purpose**: List all enrolled users  
**Auth**: JWT

**Response**:
```json
{
  "success": true,
  "count": 150,
  "users": ["student_001", "student_002", "student_003", ...]
}
```

---

## 6. Data Models & Structures

### 6.1 Keystroke Event Format

**Client-Side Capture** (JavaScript):
```javascript
{
  userId: "student_001",
  sessionId: "session_abc123",
  timestamp: Date.now(),
  key: event.key,
  dwellTime: pressTime - releaseTime,
  flightTime: currentPressTime - previousReleaseTime,
  keyCode: event.keyCode
}
```

**Behavioral Analysis Extended Format**:
```javascript
{
  timestamp: 1000,  // Relative to session start
  key: "a",
  keyCode: 65,
  dwellTime: 80,
  flightTime: 120,
  action: "type",  // or "delete", "paste", "copy"
  lineNumber: 10,
  columnNumber: 25,
  codeSnapshot: "def bubble_sort(arr):\n    n = len(arr)"
}
```

### 6.2 TypeNet Input Sequence

**Shape**: `(70, 5)`

**Features per Keystroke**:
```
[HL, IL, PL, RL, KeyCode]
```

**Example**:
```python
np.array([
    [0.080, 0.120, 0.150, 0.155, 0.255],  # Keystroke 1
    [0.075, 0.115, 0.145, 0.150, 0.270],  # Keystroke 2
    # ... 68 more rows
])
```

**Units**: All timing values in seconds (normalized from milliseconds)

### 6.3 TypeNet Output Embedding

**Shape**: `(128,)`

**Example**:
```python
np.array([0.234, -0.567, 0.123, ..., 0.891])  # 128 values
```

**Properties**:
- Unique per user
- Consistent across sessions
- Distance-preserving (cosine similarity)

---

## 7. Algorithms & Logic

### 7.1 Cosine Similarity

**Formula**:
```
similarity = (a · b) / (||a|| × ||b||)

Where:
- a, b: 128-dimensional embeddings
- · : dot product
- ||·||: L2 norm (Euclidean norm)
```

**Implementation**:
```python
def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    dot_product = np.dot(a, b)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    
    if norm_a == 0 or norm_b == 0:
        return 0.0
    
    return dot_product / (norm_a * norm_b)
```

**Range**: 0.0 (completely dissimilar) to 1.0 (identical)

### 7.2 Triplet Loss Training

**Formula**:
```
L = max(0, ||f(anchor) - f(positive)||² - ||f(anchor) - f(negative)||² + margin)

Where:
- f(·): TypeNet embedding function
- anchor: User A, sequence 1
- positive: User A, sequence 2
- negative: User B, any sequence
- margin: 1.5
```

**Goal**: Minimize intra-user distance, maximize inter-user distance

### 7.3 Friction Point Detection

**Algorithm**: Sliding Window Analysis

```python
window_size = 50  # keystrokes
overlap = 25      # 50% overlap

for i in range(0, len(events) - window_size, overlap):
    window = events[i:i + window_size]
    
    # Compute friction indicators
    deletion_rate = count_deletions(window) / window_size
    long_pauses = count_pauses(window, threshold=3000)  # > 3 seconds
    
    # Classify friction level
    if deletion_rate > 0.3 or long_pauses > 2:
        friction_points.append({
            'timestamp': window[0].timestamp,
            'severity': 'high' if deletion_rate > 0.5 else 'medium',
            'deletion_rate': deletion_rate,
            'long_pauses': long_pauses
        })
```

**Friction Indicators**:
- High deletion rate (> 30%)
- Multiple long pauses (> 3 seconds)
- Burst typing followed by mass deletion

### 7.4 Cognitive Load Estimation

**Formula**:
```
load = min(1.0, long_pause_weight × long_pause_count + deletion_weight × deletion_count)

Where:
- long_pause_weight: 0.2
- deletion_weight: 0.05
```

**Interpretation**:
- 0.0-0.3: Low cognitive load (confident)
- 0.3-0.6: Medium cognitive load (learning)
- 0.6-1.0: High cognitive load (struggling)

---

## 8. Integration & Deployment

### 8.1 Docker Configuration

**Dockerfile** (`apps/services/keystroke-service/Dockerfile`):
```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y gcc g++ && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install -r requirements.txt

# Copy application code
COPY . .

# Create models directory
RUN mkdir -p /app/models

EXPOSE 8003

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:8003/health')" || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8003"]
```

**docker-compose.yml** (excerpt):
```yaml
keystroke-service:
  build:
    context: ./apps/services/keystroke-service
    dockerfile: Dockerfile
  container_name: gradeloop-keystroke-service
  ports:
    - "8003:8003"
  environment:
    - PORT=8003
    - DEVICE=cpu
    - RABBITMQ_HOST=rabbitmq
    - GEMINI_API_KEY=${GEMINI_API_KEY}
  volumes:
    - ./apps/services/keystroke-service/models:/app/models
  networks:
    - gradeloop-network
  depends_on:
    - rabbitmq
  restart: unless-stopped
```

### 8.2 RabbitMQ Integration

**Exchange Configuration**:
- **Name**: `keystroke.exchange`
- **Type**: `topic`
- **Durability**: Durable
- **Routing Key**: `keystroke.auth.result`

**Message Format**:
```json
{
  "studentId": "student_001",
  "assignmentId": "assignment_123",
  "courseId": "course_456",
  "sessionId": "session_abc123",
  "confidenceLevel": 85.5,
  "riskScore": 14.5,
  "keystrokeSampleSize": 150,
  "timestamp": "2026-03-07T12:00:00",
  "authenticated": true,
  "similarityScore": 85.5,
  "metadata": "{\"threshold\":0.7}"
}
```

**Consumer Pattern** (for other services):
```python
channel.queue_bind(
    exchange='keystroke.exchange',
    queue='assessment_service_queue',
    routing_key='keystroke.auth.result'
)
```

### 8.3 API Gateway Routing

**Route Configuration** (Go):
```go
// keystroke-service routes
keystrokeGroup := api.Group("/keystroke")
keystrokeGroup.Use(authMiddleware.ValidateJWT())
{
    keystrokeGroup.POST("/capture", proxyToKeystrokeService)
    keystrokeGroup.POST("/enroll", proxyToKeystrokeService)
    keystrokeGroup.POST("/verify", proxyToKeystrokeService)
    keystrokeGroup.POST("/identify", proxyToKeystrokeService)
    keystrokeGroup.POST("/monitor", proxyToKeystrokeService)
    keystrokeGroup.GET("/users/enrolled", proxyToKeystrokeService)
}

func proxyToKeystrokeService(c *gin.Context) {
    targetURL := os.Getenv("KEYSTROKE_SERVICE_URL") + c.Request.URL.Path
    proxyRequest(c, targetURL)
}
```

---

## 9. Configuration & Environment

### 9.1 Environment Variables

**.env.example**:
```bash
# Google Gemini API Configuration
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash

# Service Configuration
PORT=8003
DEVICE=cpu  # or 'cuda' for GPU

# RabbitMQ Configuration
RABBITMQ_HOST=localhost

# Analysis Thresholds
MIN_EVENTS_FOR_ANALYSIS=10
MIN_EVENTS_FOR_ENROLLMENT=150
PASTE_THRESHOLD=5
SUPERHUMAN_SPEED_THRESHOLD=400
NO_ERRORS_THRESHOLD=0.01

# Production Settings
REDIS_URL=redis://localhost:6379
DATABASE_URL=postgresql://user:pass@localhost/dbname

# CORS Settings
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8000

# Feature Flags
ENABLE_LLM_ANALYSIS=true
ENABLE_DETAILED_LOGGING=false
ENABLE_RESULT_CACHING=true
```

### 9.2 Dependencies

**requirements.txt**:
```
# Backend
fastapi==0.104.1
uvicorn[standard]==0.24.0
websockets==12.0
pydantic==2.5.0

# ML/AI
--extra-index-url https://download.pytorch.org/whl/cpu
torch==2.1.0+cpu
numpy==1.24.3
google-generativeai==0.3.2

# Data Processing
pandas==2.1.3
scikit-learn==1.3.2

# Database
psycopg2-binary==2.9.9
redis==5.0.1

# Message Queue
pika==1.3.2

# Utilities
python-dotenv==1.0.0
python-multipart==0.0.6
requests==2.31.0
python-jose[cryptography]==3.3.0
```

---

## 10. Testing & Validation

### 10.1 Test Scripts

**test_api.py** - Automated API testing:
```python
# Tests included:
- test_health()
- test_root()
- test_enroll()
- test_verify()
- test_identify()
- test_capture()
- test_list_enrolled()
```

**test_integration.sh** - Bash integration test:
```bash
#!/bin/bash
# Tests:
# 1. Service health check
# 2. API Gateway connectivity
# 3. JWT authentication flow
# 4. End-to-end enrollment & verification
```

**test_integration.ps1** - PowerShell integration test (Windows)

### 10.2 Sample Data

**sample_session.json** - Complete session example with:
- 80+ keystroke events
- Realistic timing patterns
- Bubble sort implementation
- Includes deletions, pauses, corrections

---

## 11. Known Issues & Limitations

### 11.1 Critical Issues

#### ⚠️ **Issue #1**: Missing `continuous_authentication()` Implementation
**Location**: `typenet_inference.py`  
**Impact**: HIGH  
**Status**: BUG  
**Description**: The method is called in `main.py` line 409 but does not exist in `TypeNetAuthenticator` class.

**Call Site** (`main.py:409`):
```python
result = authenticator.continuous_authentication(user_id, sequences)
```

**Expected Signature**:
```python
def continuous_authentication(self, user_id: str, sequences: List[np.ndarray]) -> Dict:
    """
    Verify user across multiple recent sequences
    
    Returns:
        {
            'status': 'AUTHENTICATED' | 'SUSPICIOUS' | 'REJECTED',
            'average_risk_score': float,
            'verification_count': int,
            'individual_scores': List[float]
        }
    """
```

**Workaround**: Add implementation as shown in Section 3.3.2.

#### ⚠️ **Issue #2**: In-Memory Session Storage
**Location**: `main.py` (active_sessions dict)  
**Impact**: MEDIUM  
**Description**: Sessions stored in memory, lost on restart. Not suitable for production.

**Recommendation**: Implement Redis-based session storage.

#### ⚠️ **Issue #3**: Pickle-based Template Storage
**Location**: `models/user_templates.pkl`  
**Impact**: MEDIUM  
**Description**: Not concurrent-safe, no versioning, single point of failure.

**Recommendation**: Migrate to PostgreSQL or MongoDB.

### 11.2 Limitations

1. **Enrollment Requirements**: Minimum 150 keystrokes (can be challenging for short tasks)
2. **Real-time Latency**: TypeNet inference ~50-100ms per sequence (may accumulate)
3. **Model Dependency**: Requires `typenet_pretrained.pth` (not included in repository)
4. **LLM Cost**: Gemini API calls cost money (though free tier available)
5. **No Distributed Tracing**: Difficult to debug across microservices
6. **WebSocket Scalability**: Limited to single server instance

### 11.3 Security Considerations

1. **JWT Validation**: Relies on API Gateway (trust boundary)
2. **RabbitMQ Authentication**: Not configured in current setup
3. **Gemini API Key**: Stored in environment (consider secret manager)
4. **Template Storage**: Unencrypted pickle files (consider encryption)
5. **CORS**: Wildcard `*` in development (restrict in production)

---

## 12. Future Enhancements

### 12.1 Planned Features

1. **Distributed Session Storage**: Redis integration
2. **Template Database**: PostgreSQL migration with versioning
3. **Horizontal Scaling**: Load balancer support
4. **Continuous Authentication**: Fix missing implementation
5. **Real-time Alerts**: WebSocket push notifications
6. **Dashboard UI**: Real-time monitoring interface
7. **Model Retraining**: Periodic template updates
8. **Multi-language Support**: Beyond English keyboards
9. **Mobile Support**: Touch typing patterns
10. **A/B Testing**: Model performance comparison

### 12.2 Performance Optimizations

1. **Batch Processing**: Process multiple verifications in parallel
2. **Caching**: Redis cache for frequent verifications
3. **Model Quantization**: Reduce TypeNet model size
4. **GPU Acceleration**: CUDA support for inference
5. **Connection Pooling**: RabbitMQ and database connections

### 12.3 Research Opportunities

1. **Multi-modal Fusion**: Combine keystroke + mouse dynamics
2. **Transfer Learning**: Fine-tune on institution-specific data
3. **Explainability**: SHAP values for authentication decisions
4. **Continuous Enrollment**: Incremental template updates
5. **Adversarial Robustness**: Defense against impersonation attacks

---

## Appendix A: File Manifest

```
apps/services/keystroke-service/
├── main.py                         # FastAPI application (633 lines)
├── behavioral_analysis.py          # Behavioral analyzer (718 lines)
├── feature_extraction.py           # Feature engineering (219 lines)
├── typenet_inference.py            # TypeNet model (398 lines)
├── requirements.txt                # Python dependencies
├── Dockerfile                      # Container configuration
├── .env.example                    # Environment template
├── .dockerignore                   # Docker ignore rules
├── README.md                       # Service README
├── sample_session.json             # Test data
├── test_api.py                     # API tests (300 lines)
├── test_integration.sh             # Bash integration test
├── test_integration.ps1            # PowerShell integration test
├── models/
│   ├── train_model.py              # TypeNet training script (230 lines)
│   ├── user_templates.pkl          # Enrolled user templates (binary)
│   └── typenet_pretrained.pth      # Pre-trained TypeNet model (binary)
└── docs/
    ├── KEYSTROKE_INTEGRATION_SUMMARY.md
    ├── BEHAVIORAL_ANALYSIS_README.md       (383 lines)
    ├── BEHAVIORAL_ANALYSIS_GUIDE.md        (526 lines)
    ├── BEHAVIORAL_ANALYSIS_QUICKSTART.md
    ├── BEHAVIORAL_ANLYSIS_IMPLEMENTATION_SUMMARY.md
    └── BEHAVIORAL_ANALYSIS_DEPLOYMENT_CHECKLIST.md
```

**Total Lines of Code**: ~3,500+ (excluding docs and tests)

---

## Appendix B: Metrics Summary

### Authentication Metrics

| Metric | Type | Range | Interpretation |
|--------|------|-------|----------------|
| **Similarity Score** | Float | 0.0 - 1.0 | Cosine similarity between embeddings |
| **Risk Score** | Float | 0.0 - 1.0 | 1 - similarity (inverse) |
| **Confidence Level** | Enum | HIGH/MEDIUM/LOW | Based on similarity thresholds |
| **Threshold** | Float | 0.6 - 0.9 | Authentication decision boundary |

### Behavioral Metrics

| Metric | Type | Unit | Typical Range |
|--------|------|------|---------------|
| **Typing Speed** | Float | CPM | 100-300 |
| **Deletion Rate** | Float | Ratio | 0.1-0.3 |
| **Pause Count** | Int | Count | 5-20 per minute |
| **Friction Points** | Int | Count | 0-5 per session |
| **Human Signature** | Float | 0-100 | 70-100 (authentic) |
| **Synthetic Signature** | Float | 0-100 | 0-30 (authentic) |
| **Overall Score** | Float | 0-100 | 70+ (acceptable) |

---

## Appendix C: Error Codes

| HTTP Status | Condition | Message |
|-------------|-----------|---------|
| **200** | Success | Operation completed |
| **400** | Insufficient data | "Need at least X keystrokes" |
| **400** | Invalid sequence | "Invalid sequence shape" |
| **404** | User not enrolled | "User not enrolled" |
| **404** | Session not found | "Session not found" |
| **500** | Internal error | "Analysis failed: {error}" |

---

## Appendix D: RabbitMQ Event Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "studentId": {"type": "string"},
    "assignmentId": {"type": "string", "nullable": true},
    "courseId": {"type": "string", "nullable": true},
    "sessionId": {"type": "string", "nullable": true},
    "confidenceLevel": {"type": "number", "minimum": 0, "maximum": 100},
    "riskScore": {"type": "number", "minimum": 0, "maximum": 100},
    "keystrokeSampleSize": {"type": "integer"},
    "timestamp": {"type": "string", "format": "date-time"},
    "authenticated": {"type": "boolean"},
    "similarityScore": {"type": "number", "minimum": 0, "maximum": 100},
    "metadata": {"type": "string"}
  },
  "required": ["studentId", "timestamp", "authenticated"]
}
```

---

## Document Metadata

- **Generated**: March 7, 2026
- **Version**: 1.0.0
- **Document Lines**: 2,000+
- **Target Audience**: LLM Analysis, Developers, System Integrators
- **Completeness**: 100% (all implementations documented)
- **Maintenance**: Update on each service version release

---

**End of Document**
