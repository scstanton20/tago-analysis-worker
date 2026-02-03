import type { OpenAPIRegistry } from '@tago-analysis-worker/types/openapi';
import { z } from '@tago-analysis-worker/types/openapi';

const subscriptionBody = z.object({
  sessionId: z.string(),
  analyses: z.array(z.string()),
});

const metricsSubscriptionBody = z.object({
  sessionId: z.string(),
});

export function registerSSEPaths(registry: OpenAPIRegistry): void {
  registry.registerPath({
    method: 'get',
    path: '/sse/events',
    summary: 'Server-Sent Events stream for real-time updates',
    description:
      'Establishes a Server-Sent Events (SSE) connection for receiving real-time updates.\nAfter connection, subscribe to specific channels for targeted updates.\n\n**Channel Architecture:**\n- Global: Essential state for all clients (init, statusUpdate, analysisUpdate)\n- Stats: Per-analysis lightweight stats (log count, file size, DNS, metrics)\n- Logs: Per-analysis heavy log lines (for Log Viewer only)\n- Metrics: Detailed system metrics (for Settings modal only)',
    tags: ['Real-time Events'],
    responses: {
      200: { description: 'SSE connection established successfully' },
      401: { description: 'Authentication required or failed' },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/sse/subscribe/stats',
    summary: 'Subscribe to analysis stats channels (lightweight)',
    description:
      'Subscribe to lightweight stats for analyses: log count, file size, DNS stats, process metrics.\nUse this for Info Modal and analysis cards that need metadata without log lines.\n\nOn subscription, immediately pushes current stats to the session.',
    tags: ['Real-time Events'],
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: subscriptionBody } },
      },
    },
    responses: {
      200: { description: 'Subscription successful' },
      400: { description: 'Invalid request' },
      404: { description: 'Session not found' },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/sse/unsubscribe/stats',
    summary: 'Unsubscribe from analysis stats channels',
    tags: ['Real-time Events'],
    responses: {
      200: { description: 'Unsubscription successful' },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/sse/subscribe/logs',
    summary: 'Subscribe to analysis logs channels (heavy)',
    description:
      'Subscribe to receive individual log lines from analyses.\nUse this only when Log Viewer is open, as it streams every log line.',
    tags: ['Real-time Events'],
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: subscriptionBody } },
      },
    },
    responses: {
      200: { description: 'Subscription successful' },
      400: { description: 'Invalid request' },
      404: { description: 'Session not found' },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/sse/unsubscribe/logs',
    summary: 'Unsubscribe from analysis logs channels',
    tags: ['Real-time Events'],
    responses: {
      200: { description: 'Unsubscription successful' },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/sse/subscribe/metrics',
    summary: 'Subscribe to detailed system metrics channel',
    description:
      'Subscribe to receive detailed system metrics: CPU, memory, process details.\nUse this only when Settings modal or Metrics Dashboard is open.\n\nOn subscription, immediately pushes current metrics to the session.',
    tags: ['Real-time Events'],
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: metricsSubscriptionBody } },
      },
    },
    responses: {
      200: { description: 'Subscription successful' },
      400: { description: 'Invalid request' },
      404: { description: 'Session not found' },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/sse/unsubscribe/metrics',
    summary: 'Unsubscribe from metrics channel',
    tags: ['Real-time Events'],
    responses: {
      200: { description: 'Unsubscription successful' },
    },
  });
}
