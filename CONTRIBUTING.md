# Contributing to GradeLoop V2

Thank you for your interest in contributing to GradeLoop V2! This document provides guidelines and best practices for contributing to our monorepo.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Testing Requirements](#testing-requirements)
- [Documentation](#documentation)
- [Getting Help](#getting-help)

---

## Code of Conduct

### Our Pledge

We are committed to providing a welcoming and inclusive environment for all contributors, regardless of background or experience level.

### Expected Behavior

- Be respectful and considerate in all interactions
- Provide constructive feedback
- Focus on what is best for the project and community
- Show empathy towards other contributors

### Unacceptable Behavior

- Harassment, discrimination, or offensive comments
- Trolling, insulting, or derogatory remarks
- Publishing others' private information without permission
- Any conduct that would be inappropriate in a professional setting

---

## Getting Started

### Prerequisites

Before you begin, ensure you have:

1. **Required Software** (see [Local Development Guide](docs/local-dev-guide.md)):
   - Docker & Docker Compose
   - Go 1.23+
   - Python 3.11+
   - Node.js 20+
   - Git 2.40+

2. **Access**:
   - GitHub account with repository access
   - Jira account for issue tracking
   - Slack access for team communication

### Initial Setup

```bash
# 1. Fork the repository (if external contributor)
# Click "Fork" on GitHub

# 2. Clone your fork
git clone https://github.com/YOUR_USERNAME/gradeloop-core-v2.git
cd gradeloop-core-v2

# 3. Add upstream remote
git remote add upstream https://github.com/gradeloop/gradeloop-core-v2.git

# 4. Install dependencies
./scripts/setup-dev.sh

# 5. Install pre-commit hooks
pip install pre-commit
pre-commit install

# 6. Verify setup
docker compose -f infra/compose/docker-compose.yml up
```

---

## Development Workflow

### 1. Pick an Issue

- Browse [Jira Board](https://yourorg.atlassian.net/browse/GRADLOOP)
- Look for issues tagged with `good-first-issue` or `help-wanted`
- Assign the issue to yourself
- Move to "In Progress" status

### 2. Create a Branch

```bash
# Update your local main branch
git checkout main
git pull upstream main

# Create feature branch
git checkout -b feature/GRADLOOP-123-add-assignment-feature

# Branch naming convention:
# - feature/GRADLOOP-XXX-description
# - bugfix/GRADLOOP-XXX-description
# - hotfix/GRADLOOP-XXX-description
# - chore/GRADLOOP-XXX-description
```

### 3. Make Your Changes

- Follow [Coding Standards](#coding-standards)
- Write tests for new functionality
- Update documentation as needed
- Run tests locally before committing

### 4. Commit Your Changes

Follow the [Commit Guidelines](#commit-guidelines):

```bash
# Stage changes
git add .

# Commit with proper message
git commit -m "feat(assignments): add bulk upload feature [GRADLOOP-123]"
```

### 5. Push and Create PR

```bash
# Push to your fork
git push origin feature/GRADLOOP-123-add-assignment-feature

# Create Pull Request on GitHub
# Fill out the PR template completely
```

### 6. Address Review Feedback

- Respond to all comments
- Make requested changes
- Push updates to the same branch
- Request re-review when ready

---

## Coding Standards

### General Principles

- **DRY (Don't Repeat Yourself)**: Extract common code into shared libraries
- **SOLID Principles**: Follow object-oriented design principles
- **KISS (Keep It Simple)**: Prefer simple solutions over complex ones
- **YAGNI (You Aren't Gonna Need It)**: Don't add functionality until needed

### Go Code Standards

**Style Guide**: Follow [Effective Go](https://golang.org/doc/effective_go)

```go
// Good: Clear, idiomatic Go
func (s *AssignmentService) CreateAssignment(ctx context.Context, req *CreateAssignmentRequest) (*Assignment, error) {
    if err := validateRequest(req); err != nil {
        return nil, fmt.Errorf("invalid request: %w", err)
    }

    assignment := &Assignment{
        Title:      req.Title,
        CourseID:   req.CourseID,
        DueDate:    req.DueDate,
        CreatedAt:  time.Now(),
    }

    if err := s.repo.Save(ctx, assignment); err != nil {
        return nil, fmt.Errorf("failed to save assignment: %w", err)
    }

    return assignment, nil
}
```

**Formatting**:
```bash
# Format code
gofmt -w .
goimports -w .

# Lint code
golangci-lint run ./...
```

**Naming Conventions**:
- Use `camelCase` for private functions/variables
- Use `PascalCase` for exported functions/types
- Use descriptive names (avoid single letters except in loops)
- Acronyms should be consistent (`userID`, not `userId`)

### Python Code Standards

**Style Guide**: Follow [PEP 8](https://peps.python.org/pep-0008/)

```python
# Good: Clear, Pythonic code
class PlagiarismAnalyzer:
    def __init__(self, threshold: float = 0.8):
        self.threshold = threshold
        self.logger = logging.getLogger(__name__)

    def analyze_submission(
        self,
        submission_id: int,
        reference_docs: list[str]
    ) -> AnalysisResult:
        """
        Analyze a submission for plagiarism.

        Args:
            submission_id: The ID of the submission to analyze
            reference_docs: List of reference document IDs

        Returns:
            AnalysisResult containing similarity scores

        Raises:
            ValueError: If submission_id is invalid
        """
        if submission_id <= 0:
            raise ValueError("submission_id must be positive")

        self.logger.info(
            "Analyzing submission",
            submission_id=submission_id,
            reference_count=len(reference_docs)
        )

        # Analysis logic here
        return AnalysisResult(similarity_score=0.45)
```

**Formatting**:
```bash
# Format code
black .
isort .

# Lint code
ruff check .
mypy .
```

**Type Hints**: Always use type hints for function parameters and return values

### JavaScript/TypeScript Standards

**Style Guide**: Follow [Airbnb JavaScript Style Guide](https://github.com/airbnb/javascript)

```typescript
// Good: Clear, typed TypeScript
interface Assignment {
  id: number;
  title: string;
  courseId: number;
  dueDate: Date;
}

export async function createAssignment(
  data: Omit<Assignment, 'id'>
): Promise<Assignment> {
  const response = await fetch('/api/v1/assignments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(`Failed to create assignment: ${response.statusText}`);
  }

  return response.json();
}
```

**Formatting**:
```bash
# Format code
npm run format

# Lint code
npm run lint
```

### Database Guidelines

**Migrations**:
- Always use migrations for schema changes
- Never modify old migrations
- Test migrations both up and down
- Include rollback strategy

```sql
-- Good: Clear, reversible migration
-- migrations/000005_add_assignments_table.up.sql
CREATE TABLE assignments (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    course_id BIGINT NOT NULL REFERENCES courses(id),
    due_date TIMESTAMP WITH TIME ZONE NOT NULL,
    max_points INTEGER NOT NULL CHECK (max_points > 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_assignments_course_id ON assignments(course_id);
CREATE INDEX idx_assignments_due_date ON assignments(due_date);

-- migrations/000005_add_assignments_table.down.sql
DROP TABLE IF EXISTS assignments;
```

### API Design

**RESTful Principles**:
- Use nouns for resources, not verbs
- Use HTTP methods correctly (GET, POST, PUT, DELETE)
- Return appropriate status codes
- Version your APIs (`/api/v1/`)

**gRPC**:
- Use meaningful service and method names
- Version proto packages (`academics.v1`)
- Document all fields with comments
- Use standard error codes

---

## Commit Guidelines

### Commit Message Format

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject> [JIRA-XXX]

<optional body>

<optional footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only changes
- `style`: Code style changes (formatting, missing semicolons, etc.)
- `refactor`: Code refactoring (no functional changes)
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Maintenance tasks (dependencies, build scripts)
- `ci`: CI/CD configuration changes

### Scopes

Use the service or component name:
- `assignments`
- `academics`
- `cipas`
- `web`
- `repo` (for monorepo-wide changes)

### Examples

```bash
# Feature
feat(assignments): add bulk upload functionality [GRADELOOP-123]

# Bug fix
fix(cipas): resolve memory leak in plagiarism analyzer [GRADELOOP-456]

# Documentation
docs(readme): update installation instructions [GRADELOOP-789]

# Refactoring
refactor(academics): extract course validation logic [GRADELOOP-234]

# Multiple changes (use git commit multiple times)
feat(assignments): add due date validation [GRADELOOP-111]
test(assignments): add due date validation tests [GRADELOOP-111]
```

### Commit Best Practices

- Keep commits atomic (one logical change per commit)
- Write clear, descriptive messages
- Reference Jira ticket in every commit
- Commit often, push when ready
- Don't commit secrets, credentials, or large binaries

---

## Pull Request Process

### Before Creating a PR

- [ ] Code follows style guidelines
- [ ] All tests pass locally
- [ ] New tests added for new features
- [ ] Documentation updated
- [ ] Pre-commit hooks pass
- [ ] No merge conflicts with main

### PR Title Format

```
[GRADLOOP-XXX] Brief description of changes
```

### PR Description Template

```markdown
## Description
Brief summary of what this PR does and why.

## Related Issues
- Jira: [GRADLOOP-XXX](link-to-jira)
- Fixes #123

## Type of Change
- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## Changes Made
- Added X feature to Y service
- Refactored Z component
- Updated documentation for A

## Testing
Describe the tests you ran and how to reproduce:

1. Start local environment: `docker compose up`
2. Navigate to `http://localhost:5173`
3. Create new assignment
4. Verify bulk upload works

## Screenshots (if applicable)
[Add screenshots here]

## Checklist
- [ ] My code follows the project's style guidelines
- [ ] I have performed a self-review of my code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes
- [ ] Any dependent changes have been merged and published

## Database Changes
- [ ] New migrations added
- [ ] Migrations tested (up and down)
- [ ] No breaking schema changes
- [ ] Seed data updated (if needed)

## Dependencies
- [ ] No new dependencies
- [ ] New dependencies documented in README
- [ ] Dependencies approved by team

## Deployment Notes
Any special instructions for deployment or configuration changes needed.
```

### Review Process

1. **Automated Checks**: All CI checks must pass
   - Linting
   - Unit tests
   - Integration tests
   - Security scans

2. **Code Review**: At least 2 approvals required
   - 1 from service owner
   - 1 from another team member

3. **Review Criteria**:
   - Code quality and readability
   - Test coverage
   - Documentation completeness
   - Performance implications
   - Security considerations

4. **Addressing Feedback**:
   - Respond to all comments
   - Mark resolved threads as resolved
   - Push new commits (don't force-push)
   - Request re-review when ready

### Merging

- **Squash and Merge**: For feature branches with many commits
- **Rebase and Merge**: For clean, logical commit history
- **Never force-push** to main or shared branches
- Delete branch after merge

---

## Testing Requirements

### Minimum Coverage

All services must maintain **80% code coverage**.

### Test Types

#### Unit Tests

Test individual functions/methods in isolation:

```go
// Go unit test
func TestCreateAssignment(t *testing.T) {
    repo := &MockRepository{}
    service := NewAssignmentService(repo)

    assignment, err := service.CreateAssignment(context.Background(), &CreateAssignmentRequest{
        Title:    "Test Assignment",
        CourseID: 123,
        DueDate:  time.Now().Add(24 * time.Hour),
    })

    assert.NoError(t, err)
    assert.NotNil(t, assignment)
    assert.Equal(t, "Test Assignment", assignment.Title)
}
```

```python
# Python unit test
def test_analyze_submission():
    analyzer = PlagiarismAnalyzer(threshold=0.8)
    result = analyzer.analyze_submission(
        submission_id=123,
        reference_docs=["doc1", "doc2"]
    )

    assert result.similarity_score < 0.8
    assert len(result.matches) == 0
```

#### Integration Tests

Test interaction between components:

```go
func TestAssignmentCreationFlow(t *testing.T) {
    // Setup test database
    db := setupTestDB(t)
    defer teardownTestDB(db)

    // Create assignment
    assignment := createTestAssignment(t, db)

    // Verify in database
    retrieved, err := db.GetAssignment(assignment.ID)
    assert.NoError(t, err)
    assert.Equal(t, assignment.Title, retrieved.Title)
}
```

#### End-to-End Tests

Test complete user workflows:

```typescript
// Frontend E2E test (Playwright/Cypress)
test('instructor can create assignment', async ({ page }) => {
  await page.goto('http://localhost:5173/login');
  await page.fill('[name="email"]', 'instructor@test.com');
  await page.fill('[name="password"]', 'password');
  await page.click('button[type="submit"]');

  await page.goto('/assignments/new');
  await page.fill('[name="title"]', 'Week 5 Assignment');
  await page.click('button:has-text("Create")');

  await expect(page.locator('.success-message')).toBeVisible();
});
```

### Running Tests

```bash
# Run all tests
./scripts/test-all.sh

# Run tests for specific service
cd apps/services/assignment-service
go test ./... -v -cover

# Run with coverage report
go test ./... -coverprofile=coverage.out
go tool cover -html=coverage.out

# Python tests
cd apps/services/cipas-service
pytest --cov=src --cov-report=html

# Frontend tests
cd apps/web
npm test
npm run test:e2e
```

---

## Documentation

### When to Update Documentation

Update documentation when you:
- Add a new service or feature
- Change API contracts
- Modify configuration
- Add new dependencies
- Change deployment procedures

### Documentation Requirements

- **Code Comments**: Explain "why", not "what"
- **API Documentation**: Document all public APIs
- **README Files**: Each service must have a README
- **ADRs**: Document significant architectural decisions
- **Runbooks**: Create runbooks for operational procedures

### Documentation Standards

```go
// Good: Explains why and edge cases
// CalculateSimilarityScore computes the similarity between two documents
// using cosine similarity. Returns a value between 0 (no similarity) and
// 1 (identical). Empty documents return a score of 0.
func CalculateSimilarityScore(doc1, doc2 string) float64 {
    if doc1 == "" || doc2 == "" {
        return 0.0
    }
    // Implementation...
}
```

---

## Getting Help

### Resources

- **Documentation**: Check `docs/` directory first
- **Slack**: `#gradeloop-dev` for general questions
- **Team Wiki**: [Confluence](https://yourorg.atlassian.net/wiki/spaces/GRADLOOP)
- **Office Hours**: Tuesdays 2-3pm PT

### Asking Questions

When asking for help:
1. Search existing issues/docs first
2. Provide context and what you've tried
3. Include error messages and logs
4. Share relevant code snippets
5. Specify your environment (OS, versions, etc.)

### Reporting Bugs

Use the bug report template in Jira:
- Clear description of the issue
- Steps to reproduce
- Expected vs actual behavior
- Screenshots/logs if applicable
- Environment details

---

## License

By contributing to GradeLoop V2, you agree that your contributions will be licensed under the same license as the project.

---

## Recognition

We appreciate all contributors! Contributors will be:
- Listed in release notes
- Mentioned in team meetings
- Eligible for contribution awards

---

**Thank you for contributing to GradeLoop V2! 🎉**

Questions? Contact the maintainers or ask in `#gradeloop-dev`.