import type { OpenAPIRegistry } from '@tago-analysis-worker/types/openapi';
import { z } from '@tago-analysis-worker/types/openapi';

const kafkaClientOptionsSchema = z
  .object({
    brokers: z
      .array(z.string())
      .openapi({ example: ['broker1:9092', 'broker2:9092'] }),
    clientId: z.string().openapi({ example: 'my-analysis' }),
    ssl: z
      .boolean()
      .optional()
      .openapi({ description: 'Enable SSL connection' }),
    sasl: z
      .object({
        mechanism: z.string().openapi({ example: 'plain' }),
        username: z.string(),
        password: z.string(),
      })
      .optional()
      .openapi({ description: 'SASL authentication configuration' }),
    connectionTimeout: z.number().optional().openapi({ example: 3000 }),
    requestTimeout: z.number().optional().openapi({ example: 25000 }),
    logLevel: z
      .enum(['NOTHING', 'ERROR', 'WARN', 'INFO', 'DEBUG'])
      .optional()
      .openapi({ description: 'KafkaJS log level' }),
  })
  .openapi('KafkaClientOptions');

const kafkaProduceOptionsSchema = z
  .object({
    topic: z.string().openapi({ example: 't-uor-tago-iot' }),
    messages: z
      .array(
        z.object({
          key: z.string().optional().openapi({ example: 'device-123' }),
          value: z.string().openapi({ example: '{"data":"hello"}' }),
          headers: z.object({}).loose().optional(),
        }),
      )
      .openapi({ description: 'Array of messages to produce' }),
    acks: z.number().optional().openapi({
      description: 'Number of acknowledgements required',
      example: 1,
    }),
    timeout: z
      .number()
      .optional()
      .openapi({ description: 'Request timeout in ms', example: 5000 }),
  })
  .openapi('KafkaProduceOptions');

export function registerKafkaClientPaths(registry: OpenAPIRegistry): void {
  registry.register('KafkaClientOptions', kafkaClientOptionsSchema);
  registry.register('KafkaProduceOptions', kafkaProduceOptionsSchema);

  registry.registerPath({
    method: 'get',
    path: '/kafkaClient/getOrCreateClient',
    description:
      'Create a new Kafka client or return a cached one. Clients are cached by clientId so subsequent calls with the same clientId reuse the existing connection.',
    request: {
      query: kafkaClientOptionsSchema,
    },
    responses: {
      200: {
        description: 'Kafka client instance (cached by clientId)',
        content: {
          'application/json': {
            schema: z.object({
              description: z
                .string()
                .openapi({ example: 'Kafka client instance' }),
            }),
          },
        },
      },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/kafkaClient/sendToTopic',
    description:
      'Send messages to a Kafka topic. Handles the full producer lifecycle: connect, send, and disconnect per call.',
    request: {
      query: z.object({
        kafka: z.string().openapi({
          description: 'Kafka client instance from getOrCreateClient',
        }),
      }),
      body: {
        content: {
          'application/json': { schema: kafkaProduceOptionsSchema },
        },
      },
    },
    responses: {
      200: {
        description: 'Messages sent successfully',
      },
      500: {
        description: 'Error producing messages',
        content: {
          'application/json': {
            schema: z.object({
              error: z.string().openapi({ example: 'Connection refused' }),
            }),
          },
        },
      },
    },
  });
}
