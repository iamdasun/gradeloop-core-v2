package domain

import "context"

type EventProducer interface {
	Publish(ctx context.Context, topic string, message interface{}) error
	Close() error
}
