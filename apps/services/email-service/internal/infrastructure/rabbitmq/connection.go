package rabbitmq

import (
	"log"

	amqp "github.com/rabbitmq/amqp091-go"
)

type Connection struct {
	Conn    *amqp.Connection
	Channel *amqp.Channel
	URL     string
}

func NewConnection(url string) (*Connection, error) {
	conn, err := amqp.Dial(url)
	if err != nil {
		return nil, err
	}

	ch, err := conn.Channel()
	if err != nil {
		conn.Close()
		return nil, err
	}

	return &Connection{
		Conn:    conn,
		Channel: ch,
		URL:     url,
	}, nil
}

func (c *Connection) Close() {
	if c.Channel != nil {
		c.Channel.Close()
	}
	if c.Conn != nil {
		c.Conn.Close()
	}
}

// Reconnect logic can be added here
func (c *Connection) EnsureConnection() error {
	if c.Conn.IsClosed() {
		log.Println("RabbitMQ connection lost, reconnecting...")
		newConn, err := NewConnection(c.URL)
		if err != nil {
			return err
		}
		c.Conn = newConn.Conn
		c.Channel = newConn.Channel
	}
	return nil
}
