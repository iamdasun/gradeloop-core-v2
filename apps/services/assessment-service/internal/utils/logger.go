package utils

import (
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

var log *zap.Logger

func InitLogger() error {
	cfg := zap.NewProductionConfig()
	cfg.EncoderConfig.TimeKey = "timestamp"
	cfg.EncoderConfig.EncodeTime = zapcore.ISO8601TimeEncoder
	cfg.EncoderConfig.EncodeLevel = zapcore.CapitalColorLevelEncoder

	var err error
	log, err = cfg.Build()
	if err != nil {
		return err
	}

	return nil
}

func GetLogger() *zap.Logger {
	if log == nil {
		return zap.NewNop()
	}
	return log
}

func Sync() error {
	if log != nil {
		return log.Sync()
	}
	return nil
}
