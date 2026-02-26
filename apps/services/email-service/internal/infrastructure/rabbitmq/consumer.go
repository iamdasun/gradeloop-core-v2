package rabbitmq

import (
	amqp "github.com/rabbitmq/amqp091-go"
)

type Consumer struct {
	conn *Connection
}

func NewConsumer(conn *Connection) *Consumer {
	return &Consumer{conn: conn}
}

func (c *Consumer) Consume(queue string) (<-chan amqp.Delivery, error) {
	if err := c.conn.EnsureConnection(); err != nil {
		return nil, err
	}

	_, err := c.conn.Channel.QueueDeclare(
		queue, // name
		true,  // durable
		false, // delete when unused
		false, // exclusive
		false, // no-wait
		nil,   // arguments
	)
	if err != nil {
		return nil, err
	}

	msgs, err := c.conn.Channel.Consume(
		queue, // queue
		"",    // consumer
		false, // auto-ack
		false, // exclusive
		false, // no-local
		false, // no-wait
		nil,   // args
	)
	if err != nil {
		return nil, err
	}

	return msgs, nil
}
