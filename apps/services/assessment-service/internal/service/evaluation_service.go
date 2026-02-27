package service

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/4yrg/gradeloop-core-v2/assessment-service/internal/client"
	"github.com/4yrg/gradeloop-core-v2/assessment-service/internal/domain"
	"go.uber.org/zap"
)

// ─────────────────────────────────────────────────────────────────────────────
// Interface
// ─────────────────────────────────────────────────────────────────────────────

// EvaluationService handles test case evaluation for code submissions
type EvaluationService interface {
	// EvaluateSubmission executes code against test cases and returns results
	EvaluateSubmission(
		ctx context.Context,
		sourceCode string,
		languageID int,
		testCases []domain.TestCase,
	) (*EvaluationResult, error)

	// CompareOutputs compares expected and actual output with normalization
	CompareOutputs(expected, actual string) bool
}

// EvaluationResult contains the aggregated test case evaluation results
type EvaluationResult struct {
	TestCasesPassed int
	TotalTestCases  int
	Results         []domain.TestCaseResult
	OverallStatus   string
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

type evaluationService struct {
	judge0Client *client.Judge0Client
	logger       *zap.Logger
}

// NewEvaluationService creates a new EvaluationService
func NewEvaluationService(judge0Client *client.Judge0Client, logger *zap.Logger) EvaluationService {
	return &evaluationService{
		judge0Client: judge0Client,
		logger:       logger,
	}
}

// EvaluateSubmission executes code against all test cases
func (s *evaluationService) EvaluateSubmission(
	ctx context.Context,
	sourceCode string,
	languageID int,
	testCases []domain.TestCase,
) (*EvaluationResult, error) {
	if len(testCases) == 0 {
		return &EvaluationResult{
			TestCasesPassed: 0,
			TotalTestCases:  0,
			Results:         []domain.TestCaseResult{},
			OverallStatus:   "no_tests",
		}, nil
	}

	results := make([]domain.TestCaseResult, 0, len(testCases))
	passedCount := 0

	for _, tc := range testCases {
		result := s.evaluateSingleTestCase(ctx, sourceCode, languageID, tc)
		results = append(results, result)

		if result.Passed {
			passedCount++
		}
	}

	overallStatus := "failed"
	if passedCount == len(testCases) {
		overallStatus = "passed"
	} else if passedCount > 0 {
		overallStatus = "partial"
	}

	return &EvaluationResult{
		TestCasesPassed: passedCount,
		TotalTestCases:  len(testCases),
		Results:         results,
		OverallStatus:   overallStatus,
	}, nil
}

// evaluateSingleTestCase executes code against a single test case
func (s *evaluationService) evaluateSingleTestCase(
	ctx context.Context,
	sourceCode string,
	languageID int,
	testCase domain.TestCase,
) domain.TestCaseResult {
	result := domain.TestCaseResult{
		TestCaseID:     testCase.ID,
		Input:          testCase.Input,
		ExpectedOutput: testCase.ExpectedOutput,
	}

	// Execute code with test case input
	execResult, err := s.judge0Client.CreateSubmission(ctx, client.Judge0SubmissionRequest{
		SourceCode: sourceCode,
		LanguageID: languageID,
		Stdin:      testCase.Input,
	})

	if err != nil {
		s.logger.Error("failed to execute test case",
			zap.String("test_case_id", testCase.ID),
			zap.Error(err),
		)
		result.StatusID = 13 // Internal Error
		result.StatusDesc = "Internal Error"
		result.ActualOutput = ""
		result.Passed = false
		return result
	}

	result.ActualOutput = execResult.Stdout
	result.ExecutionTime = execResult.Time
	result.MemoryUsed = execResult.Memory
	result.StatusID = execResult.Status.ID
	result.StatusDesc = execResult.Status.Description

	// Check if execution was successful
	if !client.IsStatusFinal(execResult.Status.ID) {
		result.Passed = false
		return result
	}

	// Compare outputs (with normalization)
	result.Passed = s.CompareOutputs(testCase.ExpectedOutput, execResult.Stdout)

	return result
}

// CompareOutputs compares expected and actual output with normalization
// Normalization includes:
// - Trimming trailing whitespace from each line
// - Trimming leading/trailing whitespace from the entire output
// - Case-sensitive comparison
func (s *evaluationService) CompareOutputs(expected, actual string) bool {
	// Normalize expected output
	normalizedExpected := normalizeOutput(expected)
	// Normalize actual output
	normalizedActual := normalizeOutput(actual)

	return normalizedExpected == normalizedActual
}

// normalizeOutput applies normalization rules to output string
func normalizeOutput(output string) string {
	// Split into lines
	lines := strings.Split(output, "\n")

	// Trim trailing whitespace from each line
	for i, line := range lines {
		lines[i] = strings.TrimRight(line, " \t\r")
	}

	// Rejoin and trim overall whitespace
	result := strings.Join(lines, "\n")
	return strings.TrimSpace(result)
}

// SerializeTestCaseResults converts test case results to JSON for storage
func SerializeTestCaseResults(results []domain.TestCaseResult) ([]byte, error) {
	return json.Marshal(results)
}

// DeserializeTestCaseResults parses JSON test case results
func DeserializeTestCaseResults(data []byte) ([]domain.TestCaseResult, error) {
	var results []domain.TestCaseResult
	if err := json.Unmarshal(data, &results); err != nil {
		return nil, err
	}
	return results, nil
}
