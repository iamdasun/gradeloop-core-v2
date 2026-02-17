package rabbitmq

import (
	"context"
	"encoding/json"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
)

type Producer struct {
	conn *Connection
}

func NewProducer(conn *Connection) *Producer {
	return &Producer{conn: conn}
}

func (p *Producer) Publish(ctx context.Context, queue string, body interface{}) error {
	if err := p.conn.EnsureConnection(); err != nil {
		return err
	}

	// Ensure queue exists
	_, err := p.conn.Channel.QueueDeclare(
		queue, // name
		true,  // durable
		false, // delete when unused
		false, // exclusive
		false, // no-wait
		nil,   // arguments
	)
	if err != nil {
		return err
	}

	jsonBody, err := json.Marshal(body)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	return p.conn.Channel.PublishWithContext(ctx,
		"",    // exchange
		queue, // routing key
		false, // mandatory
		false, // immediate
		amqp.Publishing{
			ContentType: "application/json",
			Body:        jsonBody,
		})
}

func (p *Producer) Close() error {
	// Connection is managed externally (shared with consumer)
	return nil
}
