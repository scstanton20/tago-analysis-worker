import type { OpenAPIRegistry } from '@tago-analysis-worker/types/openapi';
import { z } from '@tago-analysis-worker/types/openapi';

const mqResponseSchema = z
  .object({
    status: z.number().openapi({ example: 200 }),
    data: z.object({}).loose().optional(),
    error: z.string().optional(),
  })
  .openapi('MQResponse');

const mqVersionSchema = z
  .object({
    Semantic: z.string().openapi({ example: '1.0.0' }),
    Major: z.string().openapi({ example: '1' }),
    Minor: z.string().openapi({ example: '0' }),
    Patch: z.string().openapi({ example: '0' }),
  })
  .openapi('MQVersion');

const mqTokenSchema = z.string().openapi({
  description: 'Bearer token for MachineQ API authentication',
  example: 'Bearer eyJhbGciOiJSUzI1NiIs...',
});

export function registerMQAPIPaths(registry: OpenAPIRegistry): void {
  registry.register('MQResponse', mqResponseSchema);
  registry.register('MQVersion', mqVersionSchema);
  registry.register('MQToken', mqTokenSchema);

  registry.registerPath({
    method: 'get',
    path: '/mqAPI/getToken',
    description: 'Login via OAuth to get access token',
    request: {
      query: z.object({
        clientId: z
          .string()
          .openapi({ description: 'OAuth client ID from MachineQ' }),
        clientSecret: z
          .string()
          .openapi({ description: 'OAuth client secret from MachineQ' }),
      }),
    },
    responses: {
      200: {
        description: 'Bearer token for API authentication',
        content: {
          'application/json': { schema: mqTokenSchema },
        },
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/mqAPI/getAPIVersion',
    description: 'Get MachineQ API version information',
    responses: {
      200: {
        description:
          'Version object with Semantic, Major, Minor, and Patch properties',
        content: {
          'application/json': { schema: mqVersionSchema },
        },
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/mqAPI/getAPICall',
    description: 'Generic function for API GET calls',
    request: {
      query: z.object({
        endpoint: z.string().openapi({
          description: 'API endpoint path (without base URL)',
          example: 'devices',
        }),
        token: z
          .string()
          .openapi({ description: 'Bearer token for authorization' }),
      }),
    },
    responses: {
      200: {
        description: 'Response object with status and data or error',
        content: {
          'application/json': { schema: mqResponseSchema },
        },
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/mqAPI/getDevices',
    description: 'Get all devices from MachineQ',
    request: {
      query: z.object({
        token: z
          .string()
          .openapi({ description: 'Bearer token for authorization' }),
      }),
    },
    responses: {
      200: {
        description: 'Response object with devices data',
        content: {
          'application/json': { schema: mqResponseSchema },
        },
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/mqAPI/getGateways',
    description: 'Get all gateways from MachineQ',
    request: {
      query: z.object({
        token: z
          .string()
          .openapi({ description: 'Bearer token for authorization' }),
      }),
    },
    responses: {
      200: {
        description: 'Response object with gateways data',
        content: {
          'application/json': { schema: mqResponseSchema },
        },
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/mqAPI/getAccount',
    description: 'Get account information from MachineQ',
    request: {
      query: z.object({
        token: z
          .string()
          .openapi({ description: 'Bearer token for authorization' }),
      }),
    },
    responses: {
      200: {
        description: 'Response object with account data',
        content: {
          'application/json': { schema: mqResponseSchema },
        },
      },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/mqAPI/createDevice',
    description: 'Create a new device in MachineQ',
    request: {
      query: z.object({
        token: z
          .string()
          .openapi({ description: 'Bearer token for authorization' }),
        deviceData: z
          .object({
            Name: z.string().optional(),
            DevEUI: z.string().optional(),
          })
          .passthrough()
          .openapi({ description: 'Device configuration object' }),
      }),
    },
    responses: {
      200: {
        description: 'Response object with created device data or error',
        content: {
          'application/json': { schema: mqResponseSchema },
        },
      },
    },
  });
}
