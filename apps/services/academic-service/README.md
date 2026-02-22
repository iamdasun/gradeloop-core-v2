# Academic Service

Academic service for managing academic data including courses, programs, semesters, and enrollments.

## Features

- **Faculty Management** ✨ NEW
  - Create, update, and deactivate faculties
  - Leadership panel support (Dean, Pro-Vice Chancellor, etc.)
  - Multiple leaders per faculty
  - Audit logging integration
- Course management
- Program/degree management
- Semester management
- Student enrollment tracking
- Grade management
- Academic calendar

## Technology Stack

- **Language**: Go 1.25.6
- **Framework**: Fiber v3
- **Database**: PostgreSQL
- **ORM**: GORM
- **Logger**: Zap
- **JWT**: golang-jwt/jwt

## Project Structure

```
academic-service/
├── cmd/
│   ├── main.go           # Application entry point
│   └── seeder/           # Database seeder utilities
├── internal/
│   ├── client/           # External service clients
│   ├── config/           # Configuration management
│   ├── domain/           # Domain models
│   ├── dto/              # Data transfer objects
│   ├── handler/          # HTTP handlers
│   ├── middleware/       # HTTP middleware
│   ├── repository/       # Data access layer
│   │   └── migrations/   # Database migrations
│   ├── router/           # Route definitions
│   ├── service/          # Business logic
│   └── utils/            # Utility functions
├── pkg/                  # Public packages
├── .gitignore
├── Dockerfile
├── go.mod
├── go.sum
└── README.md
```

## Environment Variables

Create a `.env` file in the root directory:

```env
# Server Configuration
SERVER_PORT=8083
ENABLE_PREFORK=false

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=academic_db
DB_SSLMODE=disable

# JWT Configuration
JWT_SECRET_KEY=your_jwt_secret_key

# Service URLs
FRONTEND_URL=http://localhost:3000
EMAIL_SERVICE_URL=http://localhost:8082
IAM_SERVICE_URL=http://localhost:8081
```

## Getting Started

### Prerequisites

- Go 1.25.6 or higher
- PostgreSQL 14 or higher
- Docker (optional)

### Installation

1. Clone the repository
2. Navigate to the service directory:
   ```bash
   cd apps/services/academic-service
   ```

3. Install dependencies:
   ```bash
   go mod download
   ```

4. Create a `.env` file with the required environment variables

5. Run the service:
   ```bash
   go run cmd/main.go
   ```

### Running with Docker

Build the Docker image:
```bash
docker build -t academic-service .
```

Run the container:
```bash
docker run -p 8083:8083 --env-file .env academic-service
```

## API Endpoints

### Health Check
- `GET /health` - Check service health

### Service Info
- `GET /` - Get service information

### API v1 (Protected Routes)
All `/api/v1` routes require JWT authentication.

#### Faculties (Super Admin Only) ✨ NEW
- `POST /api/v1/faculties` - Create a new faculty
- `GET /api/v1/faculties` - List all faculties
- `GET /api/v1/faculties/:id` - Get faculty by ID
- `PUT /api/v1/faculties/:id` - Update faculty
- `PATCH /api/v1/faculties/:id/deactivate` - Deactivate faculty
- `GET /api/v1/faculties/:id/leaders` - Get faculty leaders

#### Courses
- `GET /api/v1/courses` - List all courses
- `POST /api/v1/courses` - Create a new course
- `GET /api/v1/courses/:id` - Get course by ID
- `PUT /api/v1/courses/:id` - Update course
- `DELETE /api/v1/courses/:id` - Delete course

#### Programs
- `GET /api/v1/programs` - List all programs
- `POST /api/v1/programs` - Create a new program
- `GET /api/v1/programs/:id` - Get program by ID
- `PUT /api/v1/programs/:id` - Update program
- `DELETE /api/v1/programs/:id` - Delete program

#### Semesters
- `GET /api/v1/semesters` - List all semesters
- `POST /api/v1/semesters` - Create a new semester
- `GET /api/v1/semesters/:id` - Get semester by ID
- `PUT /api/v1/semesters/:id` - Update semester
- `DELETE /api/v1/semesters/:id` - Delete semester

#### Enrollments
- `GET /api/v1/enrollments` - List all enrollments
- `POST /api/v1/enrollments` - Create a new enrollment
- `GET /api/v1/enrollments/:id` - Get enrollment by ID
- `PUT /api/v1/enrollments/:id` - Update enrollment
- `DELETE /api/v1/enrollments/:id` - Delete enrollment

## Database Migrations

Migrations are automatically run on service startup. The migration system uses GORM's AutoMigrate feature.

## Documentation

- **Faculty Management**: See `docs/FACULTY_MANAGEMENT.md` for detailed documentation
- **Quick Start Guide**: See `docs/QUICK_START.md` for getting started with Faculty Management
- **Implementation Summary**: See `docs/IMPLEMENTATION_SUMMARY.md` for technical details

## Testing

Run tests:
```bash
go test ./...
```

Run tests with coverage:
```bash
go test -coverprofile=coverage.txt ./...
```

Run specific test suites:
```bash
# Repository tests
go test ./internal/repository -v

# Service tests
go test ./internal/service -v

# Handler tests
go test ./internal/handler -v
```

## Development

### Code Structure

- **Domain Layer**: Contains business entities and domain logic
- **Repository Layer**: Handles data persistence and retrieval
- **Service Layer**: Implements business logic and orchestrates repositories
- **Handler Layer**: Processes HTTP requests and responses
- **Router Layer**: Defines API routes and middleware

### Adding New Features

1. Define domain models in `internal/domain/`
2. Create repository methods in `internal/repository/`
3. Implement business logic in `internal/service/`
4. Create HTTP handlers in `internal/handler/`
5. Register routes in `internal/router/router.go`

## Contributing

Please read CONTRIBUTING.md for details on our code of conduct and the process for submitting pull requests.

## License

This project is part of the GradeLoop system.