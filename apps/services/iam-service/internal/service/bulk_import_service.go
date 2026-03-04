package service

import (
	"context"
	"encoding/csv"
	"fmt"
	"io"
	"net/mail"
	"regexp"
	"strings"

	"github.com/google/uuid"
	"github.com/gradeloop/iam-service/internal/dto"
	"github.com/gradeloop/iam-service/internal/repository"
	"github.com/xuri/excelize/v2"
	"gorm.io/gorm"
)

type BulkImportService interface {
	GenerateTemplate(format string) ([]byte, string, error)
	PreviewImport(ctx context.Context, reader io.Reader, filename string) (*dto.BulkImportPreviewResponse, error)
	ExecuteImport(ctx context.Context, reader io.Reader, filename string, mapping map[string]string, actorPermissions []string) (*dto.BulkImportExecuteResponse, error)
}

type bulkImportService struct {
	db          *gorm.DB
	userRepo    repository.UserRepository
	roleRepo    repository.RoleRepository
	userService UserService
}

func NewBulkImportService(db *gorm.DB, userRepo repository.UserRepository, roleRepo repository.RoleRepository, userService UserService) BulkImportService {
	return &bulkImportService{
		db:          db,
		userRepo:    userRepo,
		roleRepo:    roleRepo,
		userService: userService,
	}
}

func (s *bulkImportService) GenerateTemplate(format string) ([]byte, string, error) {
	headers := []string{"Full Name", "Email", "Role", "User Type", "Department", "Faculty", "Student ID", "Designation"}

	if format == "csv" {
		var b strings.Builder
		w := csv.NewWriter(&b)
		if err := w.Write(headers); err != nil {
			return nil, "", err
		}
		w.Flush()
		return []byte(b.String()), "text/csv", nil
	}

	f := excelize.NewFile()
	sheet := "Template"
	index, _ := f.NewSheet(sheet)
	f.SetActiveSheet(index)
	f.DeleteSheet("Sheet1")

	for i, h := range headers {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		f.SetCellValue(sheet, cell, h)
	}

	buf, err := f.WriteToBuffer()
	if err != nil {
		return nil, "", err
	}
	return buf.Bytes(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", nil
}

func (s *bulkImportService) PreviewImport(ctx context.Context, reader io.Reader, filename string) (*dto.BulkImportPreviewResponse, error) {
	var headers []string
	var previewRows []dto.ImportPreviewRow
	totalRows := 0
	validCount := 0
	const maxPreviewRows = 100

	if strings.HasSuffix(strings.ToLower(filename), ".csv") {
		r := csv.NewReader(reader)
		// Read headers
		var err error
		headers, err = r.Read()
		if err != nil {
			return nil, fmt.Errorf("failed to read CSV headers: %w", err)
		}

		mapping := s.autoMapColumns(headers)

		for {
			row, err := r.Read()
			if err == io.EOF {
				break
			}
			if err != nil {
				return nil, fmt.Errorf("failed to read CSV row: %w", err)
			}
			totalRows++

			userRow := s.mapRowToUser(row, headers, mapping)
			validationErrors := s.validateRow(ctx, userRow)
			isValid := len(validationErrors) == 0
			if isValid {
				validCount++
			}

			if totalRows <= maxPreviewRows {
				previewRows = append(previewRows, dto.ImportPreviewRow{
					RowIndex: totalRows,
					Data:     userRow,
					Errors:   validationErrors,
					IsValid:  isValid,
				})
			}
		}

		return &dto.BulkImportPreviewResponse{
			Rows:          previewRows,
			TotalRows:     totalRows,
			ValidRows:     validCount,
			InvalidRows:   totalRows - validCount,
			ColumnMapping: mapping,
		}, nil

	} else if strings.HasSuffix(strings.ToLower(filename), ".xlsx") {
		f, err := excelize.OpenReader(reader)
		if err != nil {
			return nil, fmt.Errorf("failed to read XLSX: %w", err)
		}
		defer f.Close()

		sheet := f.GetSheetName(0)
		rows, err := f.Rows(sheet)
		if err != nil {
			return nil, fmt.Errorf("failed to get rows from XLSX: %w", err)
		}
		defer rows.Close()

		if !rows.Next() {
			return &dto.BulkImportPreviewResponse{}, nil
		}

		headers, err = rows.Columns()
		if err != nil {
			return nil, fmt.Errorf("failed to get XLSX headers: %w", err)
		}

		mapping := s.autoMapColumns(headers)

		for rows.Next() {
			row, err := rows.Columns()
			if err != nil {
				return nil, fmt.Errorf("failed to get XLSX row: %w", err)
			}
			totalRows++

			userRow := s.mapRowToUser(row, headers, mapping)
			validationErrors := s.validateRow(ctx, userRow)
			isValid := len(validationErrors) == 0
			if isValid {
				validCount++
			}

			if totalRows <= maxPreviewRows {
				previewRows = append(previewRows, dto.ImportPreviewRow{
					RowIndex: totalRows,
					Data:     userRow,
					Errors:   validationErrors,
					IsValid:  isValid,
				})
			}
		}

		return &dto.BulkImportPreviewResponse{
			Rows:          previewRows,
			TotalRows:     totalRows,
			ValidRows:     validCount,
			InvalidRows:   totalRows - validCount,
			ColumnMapping: mapping,
		}, nil
	}

	return nil, fmt.Errorf("unsupported file format")
}

func (s *bulkImportService) ExecuteImport(ctx context.Context, reader io.Reader, filename string, mapping map[string]string, actorPermissions []string) (*dto.BulkImportExecuteResponse, error) {
	results := make([]dto.BulkImportResultRow, 0)
	successCount := 0
	totalProcessed := 0

	// Fetch all roles for mapping name to ID
	roles, err := s.roleRepo.GetAllRoles(ctx)
	if err != nil {
		return nil, fmt.Errorf("fetching roles: %w", err)
	}

	roleMap := make(map[string]uuid.UUID)
	for _, r := range roles {
		roleMap[strings.ToLower(r.Name)] = r.ID
	}

	processRow := func(rowIndex int, row []string, headers []string) {
		totalProcessed++
		userRow := s.mapRowToUser(row, headers, mapping)

		// Final validation before creation
		validationErrors := s.validateRow(ctx, userRow)
		if len(validationErrors) > 0 {
			results = append(results, dto.BulkImportResultRow{
				RowIndex: rowIndex,
				Email:    userRow.Email,
				Success:  false,
				Error:    strings.Join(validationErrors, "; "),
			})
			return
		}

		// Map role name to ID
		roleID, ok := roleMap[strings.ToLower(userRow.Role)]
		if !ok {
			results = append(results, dto.BulkImportResultRow{
				RowIndex: rowIndex,
				Email:    userRow.Email,
				Success:  false,
				Error:    fmt.Sprintf("role '%s' not found", userRow.Role),
			})
			return
		}

		createReq := &dto.CreateUserRequest{
			FullName:    userRow.FullName,
			Email:       userRow.Email,
			RoleID:      roleID.String(),
			UserType:    userRow.UserType,
			Department:  userRow.Department,
			Faculty:     userRow.Faculty,
			StudentID:   userRow.StudentID,
			Designation: userRow.Designation,
		}

		_, err := s.userService.CreateUser(ctx, createReq, actorPermissions)
		if err != nil {
			results = append(results, dto.BulkImportResultRow{
				RowIndex: rowIndex,
				Email:    userRow.Email,
				Success:  false,
				Error:    err.Error(),
			})
			return
		}

		results = append(results, dto.BulkImportResultRow{
			RowIndex: rowIndex,
			Email:    userRow.Email,
			Success:  true,
		})
		successCount++
	}

	if strings.HasSuffix(strings.ToLower(filename), ".csv") {
		r := csv.NewReader(reader)
		headers, err := r.Read()
		if err != nil {
			return nil, fmt.Errorf("failed to read CSV headers: %w", err)
		}

		rowIndex := 1
		for {
			row, err := r.Read()
			if err == io.EOF {
				break
			}
			if err != nil {
				return nil, fmt.Errorf("failed to read CSV row at index %d: %w", rowIndex, err)
			}
			rowIndex++
			processRow(rowIndex-1, row, headers)
		}
	} else if strings.HasSuffix(strings.ToLower(filename), ".xlsx") {
		f, err := excelize.OpenReader(reader)
		if err != nil {
			return nil, fmt.Errorf("failed to read XLSX: %w", err)
		}
		defer f.Close()

		sheet := f.GetSheetName(0)
		rows, err := f.Rows(sheet)
		if err != nil {
			return nil, fmt.Errorf("failed to get rows from XLSX: %w", err)
		}
		defer rows.Close()

		if !rows.Next() {
			return nil, fmt.Errorf("empty XLSX file")
		}

		headers, err := rows.Columns()
		if err != nil {
			return nil, fmt.Errorf("failed to get XLSX headers: %w", err)
		}

		rowIndex := 1
		for rows.Next() {
			row, err := rows.Columns()
			if err != nil {
				return nil, fmt.Errorf("failed to get XLSX row at index %d: %w", rowIndex, err)
			}
			rowIndex++
			processRow(rowIndex-1, row, headers)
		}
	} else {
		return nil, fmt.Errorf("unsupported file format")
	}

	return &dto.BulkImportExecuteResponse{
		TotalProcessed: totalProcessed,
		SuccessCount:   successCount,
		FailureCount:   totalProcessed - successCount,
		Results:        results,
	}, nil
}

func (s *bulkImportService) autoMapColumns(headers []string) map[string]string {
	mapping := make(map[string]string)
	systemFields := []string{"full_name", "email", "username", "role", "user_type", "department", "faculty", "student_id", "designation"}

	for _, h := range headers {
		normalized := s.normalizeHeader(h)
		for _, field := range systemFields {
			if normalized == field || s.isAlias(normalized, field) {
				mapping[field] = h
				break
			}
		}
	}
	return mapping
}

func (s *bulkImportService) normalizeHeader(h string) string {
	h = strings.ToLower(h)
	h = strings.ReplaceAll(h, " ", "_")
	reg, _ := regexp.Compile("[^a-z0-9_]+")
	h = reg.ReplaceAllString(h, "")
	return h
}

func (s *bulkImportService) isAlias(normalized, field string) bool {
	aliases := map[string][]string{
		"full_name":  {"name", "fullname", "user_name"},
		"email":      {"email_address", "emailaddr"},
		"user_type":  {"type", "usertype"},
		"student_id": {"student_no", "id_number", "reg_no"},
	}

	if list, ok := aliases[field]; ok {
		for _, a := range list {
			if normalized == a {
				return true
			}
		}
	}
	return false
}

func (s *bulkImportService) mapRowToUser(row []string, headers []string, mapping map[string]string) dto.ImportUserRow {
	user := dto.ImportUserRow{}
	headerToIndex := make(map[string]int)
	for i, h := range headers {
		headerToIndex[h] = i
	}

	getValue := func(field string) string {
		if header, ok := mapping[field]; ok {
			if idx, ok := headerToIndex[header]; ok && idx < len(row) {
				return strings.TrimSpace(row[idx])
			}
		}
		return ""
	}

	user.FullName = getValue("full_name")
	user.Email = getValue("email")
	user.Username = getValue("username")
	user.Role = getValue("role")
	user.UserType = getValue("user_type")
	user.Department = getValue("department")
	user.Faculty = getValue("faculty")
	user.StudentID = getValue("student_id")
	user.Designation = getValue("designation")

	if user.Username == "" {
		user.Username = user.Email
	}

	return user
}

func (s *bulkImportService) validateRow(ctx context.Context, row dto.ImportUserRow) []string {
	errors := make([]string, 0)

	if row.FullName == "" {
		errors = append(errors, "Full Name is required")
	}

	if row.Email == "" {
		errors = append(errors, "Email is required")
	} else if _, err := mail.ParseAddress(row.Email); err != nil {
		errors = append(errors, "Invalid email format")
	} else {
		// Check if email exists
		existing, _ := s.userRepo.GetUserByEmail(ctx, row.Email)
		if existing != nil {
			errors = append(errors, "Email already exists")
		}
	}

	if row.Role == "" {
		errors = append(errors, "Role is required")
	}

	if row.UserType == "" {
		errors = append(errors, "User Type is required")
	} else {
		lType := strings.ToLower(row.UserType)
		if lType != "student" && lType != "employee" && lType != "all" {
			errors = append(errors, "Invalid User Type (must be student, employee, or all)")
		}

		if lType == "student" && row.StudentID == "" {
			errors = append(errors, "Student ID is required for students")
		} else if lType == "employee" && row.Designation == "" {
			errors = append(errors, "Designation is required for employees")
		}
	}

	return errors
}
