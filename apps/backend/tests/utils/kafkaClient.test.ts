import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger
vi.mock('../../src/utils/logging/logger.ts', () => ({
  createChildLogger: vi.fn(() => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  })),
}));

// Mock kafkajs
const mockSend = vi.fn();
const mockProducerConnect = vi.fn();
const mockProducerDisconnect = vi.fn();
const mockProducer = {
  connect: mockProducerConnect,
  send: mockSend,
  disconnect: mockProducerDisconnect,
};

const mockKafkaInstance = {
  producer: vi.fn(() => mockProducer),
};

const mockKafkaConstructor = vi.fn(function () {
  return mockKafkaInstance;
});

vi.mock('kafkajs', () => ({
  Kafka: mockKafkaConstructor,
  logLevel: {
    NOTHING: 0,
    ERROR: 1,
    WARN: 2,
    INFO: 4,
    DEBUG: 5,
  },
}));

type KafkaClientModule = {
  default: {
    getOrCreateClient: (options: {
      brokers: readonly string[];
      clientId: string;
      ssl?: unknown;
      sasl?: unknown;
      connectionTimeout?: number;
      requestTimeout?: number;
      logLevel?: string;
    }) => unknown;
    sendToTopic: (
      kafka: unknown,
      options: {
        topic: string;
        messages: Array<{ value: string }>;
        acks?: number;
        timeout?: number;
      },
      producerConfig?: unknown,
    ) => Promise<void>;
    LogLevel: Record<string, number>;
  };
};

describe('kafkaClient', () => {
  let kafkaClient: KafkaClientModule['default'];

  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset module cache so clientCache is fresh each test
    vi.resetModules();
    const module =
      (await import('../../src/utils/in-process-utils/kafkaClient.ts')) as unknown as KafkaClientModule;
    kafkaClient = module.default;
  });

  describe('getOrCreateClient', () => {
    it('should create a new Kafka client with provided options', () => {
      const client = kafkaClient.getOrCreateClient({
        brokers: ['broker1:9092', 'broker2:9092'],
        clientId: 'test-client',
      });

      expect(client).toBeDefined();

      expect(mockKafkaConstructor).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: 'test-client',
          brokers: ['broker1:9092', 'broker2:9092'],
        }),
      );
    });

    it('should return cached client on subsequent calls with same clientId', () => {
      const options = {
        brokers: ['broker1:9092'],
        clientId: 'cached-client',
      };

      const client1 = kafkaClient.getOrCreateClient(options);
      const client2 = kafkaClient.getOrCreateClient(options);

      expect(client1).toBe(client2);
    });

    it('should create separate clients for different clientIds', () => {
      const client1 = kafkaClient.getOrCreateClient({
        brokers: ['broker1:9092'],
        clientId: 'client-a',
      });

      const client2 = kafkaClient.getOrCreateClient({
        brokers: ['broker1:9092'],
        clientId: 'client-b',
      });

      expect(client1).toBeDefined();
      expect(client2).toBeDefined();
    });

    it('should pass ssl and sasl options through', () => {
      kafkaClient.getOrCreateClient({
        brokers: ['broker1:9092'],
        clientId: 'secure-client',
        ssl: true,
        sasl: {
          mechanism: 'plain',
          username: 'user',
          password: 'pass',
        },
      });

      expect(mockKafkaConstructor).toHaveBeenCalledWith(
        expect.objectContaining({
          ssl: true,
          sasl: {
            mechanism: 'plain',
            username: 'user',
            password: 'pass',
          },
        }),
      );
    });
  });

  describe('sendToTopic', () => {
    it('should connect, send, and disconnect the producer', async () => {
      const kafka = kafkaClient.getOrCreateClient({
        brokers: ['broker1:9092'],
        clientId: 'producer-test',
      });

      await kafkaClient.sendToTopic(kafka, {
        topic: 'test-topic',
        messages: [{ value: JSON.stringify({ data: 'hello' }) }],
      });

      expect(mockProducerConnect).toHaveBeenCalledOnce();
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          topic: 'test-topic',
          messages: [{ value: '{"data":"hello"}' }],
        }),
      );
      expect(mockProducerDisconnect).toHaveBeenCalledOnce();
    });

    it('should disconnect producer even when send fails', async () => {
      mockSend.mockRejectedValueOnce(new Error('Send failed'));

      const kafka = kafkaClient.getOrCreateClient({
        brokers: ['broker1:9092'],
        clientId: 'fail-test',
      });

      await expect(
        kafkaClient.sendToTopic(kafka, {
          topic: 'test-topic',
          messages: [{ value: 'bad' }],
        }),
      ).rejects.toThrow('Send failed');

      expect(mockProducerDisconnect).toHaveBeenCalledOnce();
    });

    it('should disconnect producer even when connect fails', async () => {
      mockProducerConnect.mockRejectedValueOnce(
        new Error('Connection refused'),
      );

      const kafka = kafkaClient.getOrCreateClient({
        brokers: ['broker1:9092'],
        clientId: 'connect-fail-test',
      });

      await expect(
        kafkaClient.sendToTopic(kafka, {
          topic: 'test-topic',
          messages: [{ value: 'data' }],
        }),
      ).rejects.toThrow('Connection refused');

      expect(mockProducerDisconnect).toHaveBeenCalledOnce();
    });

    it('should not throw when disconnect itself fails', async () => {
      mockProducerDisconnect.mockRejectedValueOnce(
        new Error('Disconnect failed'),
      );

      const kafka = kafkaClient.getOrCreateClient({
        brokers: ['broker1:9092'],
        clientId: 'disconnect-fail-test',
      });

      await expect(
        kafkaClient.sendToTopic(kafka, {
          topic: 'test-topic',
          messages: [{ value: 'data' }],
        }),
      ).resolves.toBeUndefined();
    });

    it('should pass acks and timeout options', async () => {
      const kafka = kafkaClient.getOrCreateClient({
        brokers: ['broker1:9092'],
        clientId: 'options-test',
      });

      await kafkaClient.sendToTopic(kafka, {
        topic: 'test-topic',
        messages: [{ value: 'data' }],
        acks: 1,
        timeout: 5000,
      });

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          acks: 1,
          timeout: 5000,
        }),
      );
    });
  });

  describe('exports', () => {
    it('should export getOrCreateClient, sendToTopic, and LogLevel', () => {
      expect(kafkaClient.getOrCreateClient).toBeDefined();
      expect(kafkaClient.sendToTopic).toBeDefined();
      expect(kafkaClient.LogLevel).toBeDefined();
    });

    it('should export LogLevel with expected values', () => {
      expect(kafkaClient.LogLevel.ERROR).toBeDefined();
      expect(kafkaClient.LogLevel.WARN).toBeDefined();
      expect(kafkaClient.LogLevel.INFO).toBeDefined();
    });
  });
});
