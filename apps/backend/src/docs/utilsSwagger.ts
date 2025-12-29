import swaggerJSDoc, { type OAS3Options } from 'swagger-jsdoc';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Available package definition
 */
export interface AvailablePackage {
  name: string;
  import: string;
  description: string;
  docsUrl: string;
}

/**
 * Available utility definition
 */
export interface AvailableUtility {
  name: string;
  import: string;
  description: string;
}

/**
 * Complete utilities documentation response
 */
export interface UtilsDocsResponse {
  packages: AvailablePackage[];
  utilities: AvailableUtility[];
  openapi: object;
}

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
  },
  {
    name: 'archiver',
    import: "import archiver from 'archiver';",
    description:
      'A streaming interface for archive generation, supporting ZIP and TAR formats.',
    docsUrl: 'https://www.archiverjs.com/docs/archiver',
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
];

/**
 * Swagger configuration for in-process utility documentation
 * This is separate from the main API docs and not exposed through Swagger UI
 */
const utilsOptions: OAS3Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Tago Analysis Utilities',
      version: '1.0.0',
    },
    components: {
      schemas: {},
    },
  },
  // Point to the in-process-utils directory - support both .ts and .js
  apis: [
    path.join(__dirname, '../utils/in-process-utils/*.ts'),
    path.join(__dirname, '../utils/in-process-utils/*.js'),
  ],
};

/**
 * Generate utility documentation specs (OpenAPI only)
 * @returns OpenAPI specification object
 */
export function getUtilsSpecs(): object {
  return swaggerJSDoc(utilsOptions);
}

/**
 * Get available packages list
 * @returns Array of available packages
 */
export function getAvailablePackages(): AvailablePackage[] {
  return AVAILABLE_PACKAGES;
}

/**
 * Get available utilities list
 * @returns Array of available utilities
 */
export function getAvailableUtilities(): AvailableUtility[] {
  return AVAILABLE_UTILITIES;
}

/**
 * Generate complete utility documentation including packages, utilities, and OpenAPI specs
 * @returns Complete documentation response
 */
export function getCompleteUtilsDocs(): UtilsDocsResponse {
  return {
    packages: AVAILABLE_PACKAGES,
    utilities: AVAILABLE_UTILITIES,
    openapi: swaggerJSDoc(utilsOptions),
  };
}
