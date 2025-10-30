// Custom Loki transport for Pino
// This avoids serialization issues with pino-loki when using transport.targets

import { Transform } from 'node:stream';

export class LokiTransport extends Transform {
  constructor(options) {
    super({ objectMode: true });

    this.host = options.host;
    this.labels = options.labels || {};
    this.basicAuth = options.basicAuth;
    this.timeout = options.timeout || 30000;
    this.batching = options.batching ?? false;
    this.batchInterval = options.interval || 5000;
    this.batch = [];
    this.timer = null;

    // Start batch timer if batching is enabled
    if (this.batching) {
      this.startBatchTimer();
    }
  }

  _transform(chunk, encoding, callback) {
    try {
      const log = typeof chunk === 'string' ? JSON.parse(chunk) : chunk;

      // Build the log message - just use the original log as-is
      // Loki expects the log line to be a simple string (can be JSON)
      const logMessage = JSON.stringify(log);

      // Parse timestamp - pino uses isoTime format, so we need to parse it
      let timestampNano;
      if (typeof log.time === 'string') {
        // ISO string - parse to milliseconds then convert to nanoseconds
        timestampNano = String(new Date(log.time).getTime() * 1000000);
      } else if (typeof log.time === 'number') {
        // Unix timestamp in milliseconds - convert to nanoseconds
        timestampNano = String(log.time * 1000000);
      } else {
        // Fallback to current time
        timestampNano = String(Date.now() * 1000000);
      }

      // Convert pino log to Loki format
      const lokiEntry = {
        stream: this.labels,
        values: [[timestampNano, logMessage]],
      };

      if (this.batching) {
        this.batch.push(lokiEntry);
      } else {
        // Send immediately
        this.sendToLoki([lokiEntry]).catch((err) => {
          console.error('Failed to send log to Loki:', err.message);
        });
      }

      callback();
    } catch (err) {
      console.error('Error transforming log for Loki:', err.message);
      callback();
    }
  }

  _flush(callback) {
    if (this.batching && this.batch.length > 0) {
      this.sendToLoki(this.batch)
        .then(() => callback())
        .catch((err) => {
          console.error('Failed to flush logs to Loki:', err.message);
          callback();
        });
    } else {
      callback();
    }
  }

  startBatchTimer() {
    this.timer = setInterval(() => {
      if (this.batch.length > 0) {
        const toSend = [...this.batch];
        this.batch = [];
        this.sendToLoki(toSend).catch((err) => {
          console.error('Failed to send batched logs to Loki:', err.message);
        });
      }
    }, this.batchInterval);

    // Don't prevent Node.js from exiting
    if (this.timer.unref) {
      this.timer.unref();
    }
  }

  async sendToLoki(entries) {
    const payload = {
      streams: entries,
    };

    const headers = {
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
      throw new Error(`Failed to push logs to Loki: ${err.message}`);
    }
  }

  _destroy(error, callback) {
    if (this.timer) {
      clearInterval(this.timer);
    }
    callback(error);
  }
}
