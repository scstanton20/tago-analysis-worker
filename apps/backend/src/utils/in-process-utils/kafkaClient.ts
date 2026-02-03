/**
 * Kafka Client Module
 * Producer-only wrapper around KafkaJS for use in analysis processes via #tago-utils
 */

import { Kafka, logLevel as KafkaLogLevel } from 'kafkajs';
import type { KafkaConfig, ProducerConfig, ProducerRecord } from 'kafkajs';
import { createChildLogger } from '../logging/logger.ts';

const logger = createChildLogger('kafka-client');

/** Cached Kafka client instances keyed by clientId */
const clientCache = new Map<string, Kafka>();

/** Options for creating a Kafka instance */
interface KafkaClientOptions {
  brokers: readonly string[];
  clientId: string;
  ssl?: KafkaConfig['ssl'];
  sasl?: KafkaConfig['sasl'];
  connectionTimeout?: number;
  requestTimeout?: number;
  logLevel?: keyof typeof KafkaLogLevel;
}

/** Options for producing messages */
interface ProduceOptions {
  topic: string;
  messages: ProducerRecord['messages'];
  acks?: number;
  timeout?: number;
}

function getOrCreateClient({
  brokers,
  clientId,
  ssl,
  sasl,
  connectionTimeout,
  requestTimeout,
  logLevel,
}: KafkaClientOptions): Kafka {
  const cached = clientCache.get(clientId);
  if (cached) return cached;

  const kafkaConfig: KafkaConfig = {
    clientId,
    brokers: [...brokers],
    ssl,
    sasl,
    connectionTimeout,
    requestTimeout,
    logLevel: logLevel ? KafkaLogLevel[logLevel] : undefined,
  };

  logger.info(
    { clientId, brokerCount: brokers.length },
    'Creating Kafka client',
  );
  const client = new Kafka(kafkaConfig);
  clientCache.set(clientId, client);
  return client;
}

/**
 * Send messages to a topic.
 * Handles producer connect/send/disconnect lifecycle per call.
 */
async function sendToTopic(
  kafka: Kafka,
  { topic, messages, acks, timeout }: ProduceOptions,
  producerConfig?: ProducerConfig,
): Promise<void> {
  const producer = kafka.producer(producerConfig);

  try {
    await producer.connect();
    await producer.send({ topic, messages, acks, timeout });
    logger.debug({ topic, messageCount: messages.length }, 'Messages produced');
  } catch (error) {
    logger.error({ err: error, topic }, 'Error producing messages');
    throw error;
  } finally {
    try {
      await producer.disconnect();
    } catch (disconnectError) {
      logger.warn({ err: disconnectError }, 'Producer disconnect failed');
    }
  }
}

export default {
  getOrCreateClient,
  sendToTopic,
  LogLevel: KafkaLogLevel,
};
