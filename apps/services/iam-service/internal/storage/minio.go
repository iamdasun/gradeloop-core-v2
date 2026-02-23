package storage

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"path/filepath"

	"github.com/google/uuid"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"go.uber.org/zap"
)

// MinIOStorage handles avatar file uploads to MinIO object storage.
type MinIOStorage struct {
	client     *minio.Client
	bucketName string
	publicHost string // base URL used to build public object URLs (e.g. http://localhost:9000)
	logger     *zap.Logger
}

// NewMinIOStorage creates a MinIOStorage instance, connects to MinIO, and
// ensures the target bucket exists before returning.
func NewMinIOStorage(
	endpoint, accessKey, secretKey, bucketName string,
	useSSL bool,
	publicHost string,
	logger *zap.Logger,
) (*MinIOStorage, error) {
	client, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: useSSL,
	})
	if err != nil {
		return nil, fmt.Errorf("creating minio client: %w", err)
	}

	s := &MinIOStorage{
		client:     client,
		bucketName: bucketName,
		publicHost: publicHost,
		logger:     logger,
	}

	if err := s.ensureBucket(context.Background()); err != nil {
		return nil, err
	}

	return s, nil
}

// ensureBucket creates the configured bucket when it does not already exist,
// and sets it to public read so avatar URLs are accessible without auth.
func (s *MinIOStorage) ensureBucket(ctx context.Context) error {
	exists, err := s.client.BucketExists(ctx, s.bucketName)
	if err != nil {
		return fmt.Errorf("checking bucket %q existence: %w", s.bucketName, err)
	}

	if !exists {
		if err := s.client.MakeBucket(ctx, s.bucketName, minio.MakeBucketOptions{}); err != nil {
			return fmt.Errorf("creating bucket %q: %w", s.bucketName, err)
		}
		s.logger.Info("minio bucket created", zap.String("bucket", s.bucketName))

		// Allow anonymous GET so avatars can be loaded by browsers directly.
		policy := fmt.Sprintf(`{
			"Version":"2012-10-17",
			"Statement":[{
				"Effect":"Allow",
				"Principal":{"AWS":["*"]},
				"Action":["s3:GetObject"],
				"Resource":["arn:aws:s3:::%s/*"]
			}]
		}`, s.bucketName)

		if err := s.client.SetBucketPolicy(ctx, s.bucketName, policy); err != nil {
			s.logger.Warn("failed to set bucket policy, avatars may not be publicly readable",
				zap.String("bucket", s.bucketName),
				zap.Error(err),
			)
		}
	} else {
		s.logger.Info("minio bucket ready", zap.String("bucket", s.bucketName))
	}

	return nil
}

// UploadAvatar stores an avatar image in MinIO under avatars/{userID}/{uuid}.ext
// and returns the public URL that can be persisted in the user record.
// Any previous avatar for this user is NOT deleted — callers may clean up old
// objects separately if required.
func (s *MinIOStorage) UploadAvatar(
	ctx context.Context,
	userID string,
	fileHeader *multipart.FileHeader,
) (string, error) {
	src, err := fileHeader.Open()
	if err != nil {
		return "", fmt.Errorf("opening uploaded file: %w", err)
	}
	defer src.Close()

	// Read into a buffer so we can detect the content type and know the size.
	data, err := io.ReadAll(src)
	if err != nil {
		return "", fmt.Errorf("reading uploaded file: %w", err)
	}

	contentType := http.DetectContentType(data)
	if !isAllowedImageType(contentType) {
		return "", fmt.Errorf("unsupported image type: %s", contentType)
	}

	ext := extensionForContentType(contentType)
	objectName := fmt.Sprintf("avatars/%s/%s%s", userID, uuid.New().String(), ext)

	_, err = s.client.PutObject(
		ctx,
		s.bucketName,
		objectName,
		bytes.NewReader(data),
		int64(len(data)),
		minio.PutObjectOptions{
			ContentType: contentType,
		},
	)
	if err != nil {
		return "", fmt.Errorf("uploading avatar to minio: %w", err)
	}

	publicURL := fmt.Sprintf("%s/%s/%s", s.publicHost, s.bucketName, objectName)
	return publicURL, nil
}

// isAllowedImageType returns true for the MIME types we accept as avatar images.
func isAllowedImageType(contentType string) bool {
	switch contentType {
	case "image/jpeg", "image/png", "image/gif", "image/webp":
		return true
	default:
		return false
	}
}

// extensionForContentType maps a MIME type to a file extension.
func extensionForContentType(contentType string) string {
	switch contentType {
	case "image/jpeg":
		return ".jpg"
	case "image/png":
		return ".png"
	case "image/gif":
		return ".gif"
	case "image/webp":
		return ".webp"
	default:
		return filepath.Ext(contentType)
	}
}
