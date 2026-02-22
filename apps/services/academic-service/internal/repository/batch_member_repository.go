package repository

import (
	"errors"

	"github.com/google/uuid"
	"github.com/gradeloop/academic-service/internal/domain"
	"gorm.io/gorm"
)

// BatchMemberRepository defines all data operations for batch members.
type BatchMemberRepository interface {
	AddMember(member *domain.BatchMember) error
	GetMembers(batchID uuid.UUID) ([]domain.BatchMember, error)
	GetMember(batchID, userID uuid.UUID) (*domain.BatchMember, error)
	RemoveMember(batchID, userID uuid.UUID) error
}

// batchMemberRepository is the concrete GORM-backed implementation.
type batchMemberRepository struct {
	db *gorm.DB
}

// NewBatchMemberRepository creates a new batchMemberRepository.
func NewBatchMemberRepository(db *gorm.DB) BatchMemberRepository {
	return &batchMemberRepository{db: db}
}

// AddMember inserts a new batch membership record.
func (r *batchMemberRepository) AddMember(member *domain.BatchMember) error {
	return r.db.Create(member).Error
}

// GetMembers returns all members belonging to the given batch.
func (r *batchMemberRepository) GetMembers(batchID uuid.UUID) ([]domain.BatchMember, error) {
	var members []domain.BatchMember
	err := r.db.
		Where("batch_id = ?", batchID).
		Order("enrolled_at ASC").
		Find(&members).Error
	return members, err
}

// GetMember loads a single batch membership by composite primary key.
// Returns nil, nil when no record is found.
func (r *batchMemberRepository) GetMember(batchID, userID uuid.UUID) (*domain.BatchMember, error) {
	var member domain.BatchMember
	err := r.db.
		Where("batch_id = ? AND user_id = ?", batchID, userID).
		First(&member).Error

	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}

	return &member, nil
}

// RemoveMember hard-deletes the membership row identified by the composite key.
func (r *batchMemberRepository) RemoveMember(batchID, userID uuid.UUID) error {
	return r.db.
		Where("batch_id = ? AND user_id = ?", batchID, userID).
		Delete(&domain.BatchMember{}).Error
}
