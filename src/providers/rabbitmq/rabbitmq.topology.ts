import { type Channel } from 'amqplib';
import { configuration } from '../../config/configuration';
import { RABBITMQ } from '../../common/constant';

/**
 * Declares the whole broker layout (idempotent, run by both processes on every (re)connect):
 *
 *   splitease.events (topic) ──► <queue>            ── consumer
 *                                   │ x-dead-letter-exchange
 *                                   ▼
 *   splitease.dlx (direct)  ──► <queue>.dlq        (poison / exhausted messages)
 *
 *   failed with retries left ──► <queue>.retry (TTL) ──► back to <queue>
 */
export async function assertTopology(channel: Channel): Promise<void> {
  await channel.assertExchange(RABBITMQ.EXCHANGE, 'topic', { durable: true });
  await channel.assertExchange(RABBITMQ.DEAD_LETTER_EXCHANGE, 'direct', { durable: true });

  /* eslint-disable no-await-in-loop -- amqplib channels are not safe for concurrent commands */
  for (const queue of Object.values(RABBITMQ.QUEUES)) {
    const retryQueue = RABBITMQ.retryQueue(queue.name);
    const deadLetterQueue = RABBITMQ.deadLetterQueue(queue.name);

    await channel.assertQueue(queue.name, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': RABBITMQ.DEAD_LETTER_EXCHANGE,
        'x-dead-letter-routing-key': queue.name,
      },
    });
    for (const routingKey of queue.bindings) {
      await channel.bindQueue(queue.name, RABBITMQ.EXCHANGE, routingKey);
    }

    await channel.assertQueue(retryQueue, {
      durable: true,
      arguments: {
        'x-message-ttl': configuration.rabbitmq.retryDelayMs,
        'x-dead-letter-exchange': '',
        'x-dead-letter-routing-key': queue.name,
      },
    });

    await channel.assertQueue(deadLetterQueue, { durable: true });
    await channel.bindQueue(deadLetterQueue, RABBITMQ.DEAD_LETTER_EXCHANGE, queue.name);
  }
  /* eslint-enable no-await-in-loop */
}
