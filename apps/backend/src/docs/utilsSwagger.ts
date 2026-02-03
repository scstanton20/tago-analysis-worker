import type {
  AvailablePackage,
  AvailableUtility,
  UtilsDocsResponse,
} from '@tago-analysis-worker/types';
import {
  OpenApiGeneratorV31,
  OpenAPIRegistry,
} from '@tago-analysis-worker/types/openapi';
import { getPackageVersion } from '../utils/packageVersion.ts';
import { registerKafkaClientPaths } from './paths/in-process-utils/kafkaClientPaths.ts';
import { registerMQAPIPaths } from './paths/in-process-utils/mqAPIPaths.ts';

/**
 * Packages available for import in analysis scripts
 * These are npm packages bundled with the analysis runner
 */
const AVAILABLE_PACKAGES: AvailablePackage[] = [
  {
    name: '@tago-io/sdk',
    import: "import { Analysis } from '@tago-io/sdk';",
    description:
      'Official TagoIO SDK for interacting with the TagoIO platform - manage devices, send data, and more.',
    docsUrl: 'https://js.sdk.tago.io/',
    packageVersion: getPackageVersion('@tago-io/sdk'),
  },
  {
    name: 'archiver',
    import: "import archiver from 'archiver';",
    description:
      'A streaming interface for archive generation, supporting ZIP and TAR formats.',
    docsUrl: 'https://www.archiverjs.com/docs/archiver',
    packageVersion: getPackageVersion('archiver'),
  },
  {
    name: 'kafkajs',
    import: "import { Kafka } from 'kafkajs';",
    description:
      'A modern Apache Kafka client for Node.js. Use directly for advanced Kafka operations, or use the kafkaClient utility from #tago-utils for a simplified producer workflow.',
    docsUrl: 'https://kafka.js.org/docs/getting-started',
    packageVersion: getPackageVersion('kafkajs'),
  },
];

/**
 * In-process utilities available via #tago-utils import
 * These are custom utilities provided by the analysis runner
 */
const AVAILABLE_UTILITIES: AvailableUtility[] = [
  {
    name: 'mqAPI',
    import: "import { mqAPI } from '#tago-utils';",
    description:
      'MachineQ LoRaWAN API client for device management, gateway monitoring, and account operations.',
  },
  {
    name: 'kafkaClient',
    import: "import { kafkaClient } from '#tago-utils';",
    description:
      'Kafka producer client for sending messages to Kafka topics. Supports client caching by clientId and handles producer connect/send/disconnect lifecycle.',
  },
];

// Create a separate registry for utility documentation
const utilsRegistry = new OpenAPIRegistry();
registerKafkaClientPaths(utilsRegistry);
registerMQAPIPaths(utilsRegistry);

/** Code samples for utility functions, keyed by path */
const CODE_SAMPLES: Record<string, Array<{ lang: string; source: string }>> = {
  '/mqAPI/getToken': [
    {
      lang: 'javascript',
      source: `import { mqAPI } from '#tago-utils';

const token = await mqAPI.getToken('your-client-id', 'your-client-secret');
// Returns: "Bearer eyJhbGciOiJSUzI1NiIs..."`,
    },
  ],
  '/mqAPI/getAPIVersion': [
    {
      lang: 'javascript',
      source: `import { mqAPI } from '#tago-utils';

const version = await mqAPI.getAPIVersion();
// Returns: { Semantic: '1.0.0', Major: '1', Minor: '0', Patch: '0' }`,
    },
  ],
  '/mqAPI/getAPICall': [
    {
      lang: 'javascript',
      source: `import { mqAPI } from '#tago-utils';

const token = await mqAPI.getToken(clientId, clientSecret);
const result = await mqAPI.getAPICall('devices/status', token);
// Returns: { status: 200, data: { ... } }`,
    },
  ],
  '/mqAPI/getDevices': [
    {
      lang: 'javascript',
      source: `import { mqAPI } from '#tago-utils';

const token = await mqAPI.getToken(clientId, clientSecret);
const result = await mqAPI.getDevices(token);
// Returns: { status: 200, data: { devices: [...] } }`,
    },
  ],
  '/mqAPI/getGateways': [
    {
      lang: 'javascript',
      source: `import { mqAPI } from '#tago-utils';

const token = await mqAPI.getToken(clientId, clientSecret);
const result = await mqAPI.getGateways(token);
// Returns: { status: 200, data: { gateways: [...] } }`,
    },
  ],
  '/mqAPI/getAccount': [
    {
      lang: 'javascript',
      source: `import { mqAPI } from '#tago-utils';

const token = await mqAPI.getToken(clientId, clientSecret);
const result = await mqAPI.getAccount(token);
// Returns: { status: 200, data: { account: { ... } } }`,
    },
  ],
  '/mqAPI/createDevice': [
    {
      lang: 'javascript',
      source: `import { mqAPI } from '#tago-utils';

const token = await mqAPI.getToken(clientId, clientSecret);
const result = await mqAPI.createDevice(token, {
  Name: 'My Sensor',
  DevEUI: '0123456789ABCDEF',
});
// Returns: { status: 201, data: { device: { id: '123' } } }`,
    },
  ],
  '/kafkaClient/getOrCreateClient': [
    {
      lang: 'javascript',
      source: `import { kafkaClient } from '#tago-utils';

const kafka = kafkaClient.getOrCreateClient({
  clientId: 'my-analysis',
  brokers: ['kafka.example.com:9092'],
});
// Client is cached — subsequent calls with the same clientId reuse it`,
    },
  ],
  '/kafkaClient/sendToTopic': [
    {
      lang: 'javascript',
      source: `import { kafkaClient } from '#tago-utils';

const kafka = kafkaClient.getOrCreateClient({
  clientId: 'my-analysis',
  brokers: ['kafka.example.com:9092'],
});

await kafkaClient.sendToTopic(kafka, {
  topic: 'my-topic',
  messages: [{ value: JSON.stringify({ temperature: 25.5 }) }],
});`,
    },
  ],
};

function generateUtilsSpec(): object {
  const generator = new OpenApiGeneratorV31(utilsRegistry.definitions);
  const spec = generator.generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'Tago Analysis Utilities',
      version: '1.0.0',
    },
  }) as { paths?: Record<string, Record<string, unknown>> };

  // Inject x-code-samples into generated paths
  if (spec.paths) {
    for (const [path, methods] of Object.entries(spec.paths)) {
      const samples = CODE_SAMPLES[path];
      if (samples) {
        for (const method of Object.values(methods)) {
          if (typeof method === 'object' && method !== null) {
            (method as Record<string, unknown>)['x-code-samples'] = samples;
          }
        }
      }
    }
  }

  return spec;
}

/**
 * Generate utility documentation specs (OpenAPI only)
 */
export function getUtilsSpecs(): object {
  return generateUtilsSpec();
}

/**
 * Get available packages list
 */
export function getAvailablePackages(): AvailablePackage[] {
  return AVAILABLE_PACKAGES;
}

/**
 * Get available utilities list
 */
export function getAvailableUtilities(): AvailableUtility[] {
  return AVAILABLE_UTILITIES;
}

/**
 * Generate complete utility documentation including packages, utilities, and OpenAPI specs
 */
export function getCompleteUtilsDocs(): UtilsDocsResponse {
  return {
    packages: AVAILABLE_PACKAGES,
    utilities: AVAILABLE_UTILITIES,
    openapi: generateUtilsSpec(),
  };
}
