# Keystroke Dynamics Authentication & Behavioral Analysis Service

Behavioral biometrics microservice for continuous student authentication and advanced behavioral analysis using keystroke dynamics and LLM-powered insights.

## Features

### Authentication
- **User Enrollment**: Create behavioral biometric templates from typing patterns
- **Verification**: Verify user identity based on typing patterns
- **Identification**: Identify users from typing patterns (1:N matching)
- **Continuous Monitoring**: Real-time session monitoring with risk assessment
- **WebSocket Support**: Real-time updates for monitoring sessions

### 🆕 Behavioral Analysis
- **Authenticity Detection**: Identify copy-paste, AI assistance, and plagiarism patterns
- **Cognitive Process Analysis**: Evaluate problem-solving approach and learning depth
- **Friction Point Detection**: Identify struggle areas and conceptual hurdles
- **Pedagogical Feedback**: AI-powered recommendations for instructors
- **LLM Integration**: Deep qualitative analysis using Google Gemini

## Technology Stack

- **Framework**: FastAPI
- **ML Model**: TypeNet (LSTM-based keystroke dynamics)
- **Device**: CPU (can be configured for GPU)

## API Endpoints

### Health Check
- `GET /health` - Service health status
- `GET /` - Service information

### Keystroke Authentication
- `POST /api/keystroke/capture` - Capture keystroke events
- `POST /api/keystroke/enroll` - Enroll a new user
- `POST /api/keystroke/verify` - Verify user identity
- `POST /api/keystroke/identify` - Identify user from typing pattern
- `POST /api/keystroke/monitor` - Monitor active session
- `GET /api/keystroke/session/status/{user_id}/{session_id}` - Get session status
- `DELETE /api/keystroke/session/{user_id}/{session_id}` - End session
- `GET /api/keystroke/users/enrolled` - List enrolled users

### 🆕 Behavioral Analysis
- `POST /api/keystroke/analyze` - Analyze complete coding session for behavioral insights
- `GET /api/keystroke/analyze/config` - Get analysis configuration and capabilities

### WebSocket
- `WS /ws/monitor/{user_id}/{session_id}` - Real-time monitoring

## Running Locally

``(Optional) Set up Gemini API for behavioral analysis
export GEMINI_API_KEY="your-api-key"

# Run the service
python main.py
```

The service will be available at `http://localhost:8080`

## Quick Start - Behavioral Analysis

Try the analysis demo:

```bash
# Start the web frontend
cd ../../web
pnpm dev

# Open browser
open http://localhost:3000/demo/behavioral-analysis
```

Or use the API directly:

```bash
curl -X POST http://localhost:8080/api/keystroke/analyze \
  -H "Content-Type: application/json" \
  -d @sample_session.json
```

## Documentation

- **Full Guide**: `../../docs/BEHAVIORAL_ANALYSIS_GUIDE.md`
- **Quick Start**: `../../docs/BEHAVIORAL_ANALYSIS_QUICKSTART.md`
- **Integration**: `../../docs/keystroke-service-integration.md
python main.py
```

The service will be available at `http://localhost:8080`

## Running with Docker

```bash
# Build the image
docker build -t keystroke-service .

# Run the container
docker run -p 8080:8080 keystroke-service
```

## Environment Variables

- `PORT`: Service port (default: 8080)
- `DEVICE`: Computing device - 'cpu' or 'cuda' (default: cpu)

## Data Requirements

- **Enrollment**: Minimum 150 keystrokes (2-3 typing sequences)
- **Verification**: Minimum 70 keystrokes (1 sequence)
- **Monitoring**: Continuous capture, analysis every 150 keystrokes

## Model Information

The service uses TypeNet, a pre-trained LSTM model for keystroke dynamics:
- Input: Sequences of 70 keystrokes with 5 features each (HL, IL, PL, RL, KeyCode)
- Output: 128-dimensional embedding for similarity comparison
- Templates stored in `models/user_templates.pkl`



the assignment submissions will handle by another service. I can get the assignment id and the student id later after the service created.

I have to display the students continuous auth confident level data to the instructure. therefore want to store continuous auth data with timestamp and the assignment id,course id and student id in a database.

Should i use a seperate sprinboot service or can use the current keystroke service ?