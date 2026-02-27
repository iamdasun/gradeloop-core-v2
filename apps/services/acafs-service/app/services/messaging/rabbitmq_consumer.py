"""RabbitMQ consumer for processing submission events."""

import json
import threading
import time
from typing import Callable, Optional

import pika
from pika.adapters.blocking_connection import BlockingChannel
from pika.spec import Basic, BasicProperties

from app.config import Settings
from app.logging_config import get_logger
from app.schemas import SubmissionEvent

logger = get_logger(__name__)


class RabbitMQConsumer:
    """Consumer for RabbitMQ submission events."""

    def __init__(
        self,
        settings: Settings,
        message_handler: Callable[[SubmissionEvent], None],
    ):
        """Initialize RabbitMQ consumer.
        
        Args:
            settings: Application settings
            message_handler: Callback for processing messages
        """
        self.settings = settings
        self.message_handler = message_handler
        self._connection: Optional[pika.BlockingConnection] = None
        self._channel: Optional[BlockingChannel] = None
        self._closing = False
        self._consumer_tag: Optional[str] = None

    def _connect(self) -> pika.BlockingConnection:
        """Establish connection to RabbitMQ."""
        params = pika.URLParameters(self.settings.rabbitmq_url)
        params.heartbeat = 600
        params.blocked_connection_timeout = 300
        
        connection = pika.BlockingConnection(params)
        logger.info("rabbitmq_connected", url=self.settings.rabbitmq_url)
        return connection

    def _declare_topology(self, channel: BlockingChannel) -> None:
        """Declare exchange, queue, and bindings.
        
        Args:
            channel: AMQP channel
        """
        # Declare exchange
        channel.exchange_declare(
            exchange=self.settings.rabbitmq_exchange,
            exchange_type="topic",
            durable=True,
        )
        logger.debug("exchange_declared", exchange=self.settings.rabbitmq_exchange)

        # Declare queue with DLX
        args = {
            "x-dead-letter-exchange": f"{self.settings.rabbitmq_exchange}.dlx",
            "x-max-length": 50000,
        }
        
        channel.queue_declare(
            queue=self.settings.rabbitmq_queue,
            durable=True,
            arguments=args,
        )
        logger.debug("queue_declared", queue=self.settings.rabbitmq_queue)

        # Declare DLX and dead letter queue
        channel.exchange_declare(
            exchange=f"{self.settings.rabbitmq_exchange}.dlx",
            exchange_type="fanout",
            durable=True,
        )
        
        channel.queue_declare(
            queue=f"{self.settings.rabbitmq_queue}.dead",
            durable=True,
        )
        
        channel.queue_bind(
            queue=f"{self.settings.rabbitmq_queue}.dead",
            exchange=f"{self.settings.rabbitmq_exchange}.dlx",
        )

        # Bind queue to exchange
        channel.queue_bind(
            queue=self.settings.rabbitmq_queue,
            exchange=self.settings.rabbitmq_exchange,
            routing_key=self.settings.rabbitmq_routing_key,
        )
        logger.debug(
            "queue_bound",
            queue=self.settings.rabbitmq_queue,
            routing_key=self.settings.rabbitmq_routing_key,
        )

    def _on_message(
        self,
        channel: BlockingChannel,
        method: Basic.Deliver,
        properties: BasicProperties,
        body: bytes,
    ) -> None:
        """Process incoming message.
        
        Args:
            channel: AMQP channel
            method: Delivery method
            properties: Message properties
            body: Message body
        """
        delivery_tag = method.delivery_tag
        message_id = properties.message_id or "unknown"
        
        logger.info(
            "message_received",
            message_id=message_id,
            delivery_tag=delivery_tag,
        )

        try:
            # Parse message
            data = json.loads(body)
            event = SubmissionEvent.model_validate(data)
            
            logger.info(
                "submission_event_parsed",
                submission_id=str(event.submission_id),
                assignment_id=str(event.assignment_id),
                language=event.language,
            )

            # Process message
            self.message_handler(event)
            
            # Acknowledge success
            channel.basic_ack(delivery_tag=delivery_tag)
            logger.info(
                "message_processed",
                message_id=message_id,
                submission_id=str(event.submission_id),
            )

        except json.JSONDecodeError as e:
            logger.error(
                "invalid_json",
                message_id=message_id,
                error=str(e),
            )
            # Reject without requeue (send to DLX)
            channel.basic_nack(delivery_tag=delivery_tag, requeue=False)

        except Exception as e:
            logger.error(
                "message_processing_failed",
                message_id=message_id,
                error=str(e),
                redelivered=method.redelivered,
            )
            
            if method.redelivered:
                # Second failure - send to DLX
                channel.basic_nack(delivery_tag=delivery_tag, requeue=False)
                logger.warning("message_sent_to_dlx", message_id=message_id)
            else:
                # First failure - requeue for retry
                channel.basic_nack(delivery_tag=delivery_tag, requeue=True)

    def start(self) -> None:
        """Start consuming messages."""
        while not self._closing:
            try:
                self._connection = self._connect()
                self._channel = self._connection.channel()
                
                # Declare topology
                self._declare_topology(self._channel)
                
                # Set QoS
                self._channel.basic_qos(
                    prefetch_count=self.settings.rabbitmq_concurrency,
                )
                
                # Start consuming
                self._consumer_tag = self._channel.basic_consume(
                    queue=self.settings.rabbitmq_queue,
                    on_message_callback=self._on_message,
                )
                
                logger.info(
                    "consumer_started",
                    queue=self.settings.rabbitmq_queue,
                    concurrency=self.settings.rabbitmq_concurrency,
                )
                
                # Block and process messages
                self._channel.start_consuming()
                
            except pika.exceptions.ConnectionClosedByBroker:
                logger.warning("connection_closed_by_broker")
                if not self._closing:
                    time.sleep(5)
                    continue
                break
                
            except pika.exceptions.AMQPChannelError as e:
                logger.error("channel_error", error=str(e))
                if not self._closing:
                    time.sleep(5)
                    continue
                break
                
            except Exception as e:
                logger.error("unexpected_error", error=str(e))
                if not self._closing:
                    time.sleep(5)
                    continue
                break

    def stop(self) -> None:
        """Stop consuming messages gracefully."""
        logger.info("stopping_consumer")
        self._closing = True
        
        if self._channel and self._channel.is_open:
            self._channel.stop_consuming()
            
        if self._connection and self._connection.is_open:
            self._connection.close()
            
        logger.info("consumer_stopped")
