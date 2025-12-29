// Custom Loki transport for Pino
// This avoids serialization issues with pino-loki when using transport.targets

import { Transform } from 'node:stream';
import type { TransformCallback } from 'node:stream';
import { LOGGING } from '../../constants.ts';

interface LokiBasicAuth {
  username: string;
  password: string;
}

interface LokiLabels {
  [key: string]: string;
}

interface LokiTransportOptions {
  host: string;
  labels?: LokiLabels;
  basicAuth?: LokiBasicAuth;
  timeout?: number;
  batching?: boolean;
  interval?: number;
}

interface LokiEntry {
  stream: LokiLabels;
  values: [string, string][];
}

interface PinoLog {
  time?: string | number;
  msg?: string;
  level?: number;
  [key: string]: unknown;
}

export class LokiTransport extends Transform {
  private host: string;
  private labels: LokiLabels;
  private basicAuth?: LokiBasicAuth;
  private timeout: number;
  private batching: boolean;
  private batchInterval: number;
  private batch: LokiEntry[];
  private timer: ReturnType<typeof setInterval> | null;

  constructor(options: LokiTransportOptions) {
    super({ objectMode: true });

    this.host = options.host;
    this.labels = options.labels || {};
    this.basicAuth = options.basicAuth;
    this.timeout = options.timeout || LOGGING.LOKI_TIMEOUT_MS;
    this.batching = options.batching ?? false;
    this.batchInterval = options.interval || LOGGING.LOKI_BATCH_INTERVAL_MS;
    this.batch = [];
    this.timer = null;

    // Start batch timer if batching is enabled
    if (this.batching) {
      this.startBatchTimer();
    }
  }

  _transform(
    chunk: string | PinoLog,
    _encoding: BufferEncoding,
    callback: TransformCallback,
  ): void {
    try {
      const log: PinoLog =
        typeof chunk === 'string' ? JSON.parse(chunk) : chunk;

      // Build the log message - just use the original log as-is
      // Loki expects the log line to be a simple string (can be JSON)
      const logMessage = JSON.stringify(log);

      // Parse timestamp - pino uses isoTime format, so we need to parse it
      let timestampNano: string;
      if (typeof log.time === 'string') {
        // ISO string - parse to milliseconds then convert to nanoseconds
        timestampNano = String(
          new Date(log.time).getTime() * LOGGING.NANOSECONDS_PER_MILLISECOND,
        );
      } else if (typeof log.time === 'number') {
        // Unix timestamp in milliseconds - convert to nanoseconds
        timestampNano = String(log.time * LOGGING.NANOSECONDS_PER_MILLISECOND);
      } else {
        // Fallback to current time
        timestampNano = String(
          Date.now() * LOGGING.NANOSECONDS_PER_MILLISECOND,
        );
      }

      // Convert pino log to Loki format
      const lokiEntry: LokiEntry = {
        stream: this.labels,
        values: [[timestampNano, logMessage]],
      };

      if (this.batching) {
        this.batch.push(lokiEntry);
      } else {
        // Send immediately
        this.sendToLoki([lokiEntry]).catch((err) => {
          console.error('Failed to send log to Loki:', (err as Error).message);
        });
      }

      callback();
    } catch (err) {
      console.error('Error transforming log for Loki:', (err as Error).message);
      callback();
    }
  }

  _flush(callback: TransformCallback): void {
    if (this.batching && this.batch.length > 0) {
      this.sendToLoki(this.batch)
        .then(() => callback())
        .catch((err) => {
          console.error(
            'Failed to flush logs to Loki:',
            (err as Error).message,
          );
          callback();
        });
    } else {
      callback();
    }
  }

  private startBatchTimer(): void {
    this.timer = setInterval(() => {
      if (this.batch.length > 0) {
        const toSend = [...this.batch];
        this.batch = [];
        this.sendToLoki(toSend).catch((err) => {
          console.error(
            'Failed to send batched logs to Loki:',
            (err as Error).message,
          );
        });
      }
    }, this.batchInterval);

    // Don't prevent Node.js from exiting
    if (this.timer.unref) {
      this.timer.unref();
    }
  }

  private async sendToLoki(entries: LokiEntry[]): Promise<void> {
    const payload = {
      streams: entries,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.basicAuth) {
      const auth = Buffer.from(
        `${this.basicAuth.username}:${this.basicAuth.password}`,
      ).toString('base64');
      headers.Authorization = `Basic ${auth}`;
    }

    try {
      const payloadString = JSON.stringify(payload);

      const response = await fetch(`${this.host}/loki/api/v1/push`, {
        method: 'POST',
        headers,
        body: payloadString,
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Loki returned ${response.status}: ${text}`);
      }
    } catch (err) {
      throw new Error(`Failed to push logs to Loki: ${(err as Error).message}`);
    }
  }

  _destroy(error: Error | null, callback: (error: Error | null) => void): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
    callback(error);
  }
}
