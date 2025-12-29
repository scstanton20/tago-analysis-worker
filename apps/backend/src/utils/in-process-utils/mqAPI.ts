/**
 * @swagger
 * components:
 *   schemas:
 *     MQToken:
 *       type: string
 *       description: Bearer token for MachineQ API authentication
 *       example: "Bearer eyJhbGciOiJSUzI1NiIs..."
 *     MQVersion:
 *       type: object
 *       properties:
 *         Semantic:
 *           type: string
 *           example: "1.0.0"
 *         Major:
 *           type: string
 *           example: "1"
 *         Minor:
 *           type: string
 *           example: "0"
 *         Patch:
 *           type: string
 *           example: "0"
 *     MQResponse:
 *       type: object
 *       properties:
 *         status:
 *           type: number
 *           example: 200
 *         data:
 *           type: object
 *         error:
 *           type: string
 */

/**
 * MachineQ API Module
 * Core functionality for interacting with MachineQ API
 */

import { createChildLogger } from '../logging/logger.ts';

// Module-level logger for MachineQ API operations
const logger = createChildLogger('mq-api');

// MachineQ API configuration
const MQ_CONFIG = {
  tokenUrl: 'https://oauth.machineq.net/oauth2/token',
  apiUrl: 'https://api.machineq.net/v1',
} as const;

// Default headers
const DEFAULT_HEADERS = {
  Accept: 'application/json',
  'Content-Type': 'application/json',
} as const;

/** MachineQ API version information */
interface MQVersion {
  Semantic: string;
  Major: string;
  Minor: string;
  Patch: string;
}

/** MachineQ API response */
interface MQResponse<T = unknown> {
  status: number;
  data?: T;
  error?: string | object;
}

/** OAuth token response */
interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

/** Device configuration */
interface DeviceConfig {
  Name?: string;
  DevEUI?: string;
  ActivationType?: string;
  ServiceProfile?: string;
  DeviceProfile?: string;
  DecoderType?: string;
  OutputProfile?: string;
  PrivateData?: boolean;
  [key: string]: unknown;
}

/**
 * @swagger
 * /mqAPI/getToken:
 *   get:
 *     description: Login via OAuth to get access token
 *     parameters:
 *       - name: clientId
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *         description: OAuth client ID from MachineQ
 *       - name: clientSecret
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *         description: OAuth client secret from MachineQ
 *     responses:
 *       '200':
 *         description: Bearer token for API authentication
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MQToken'
 *     x-code-samples:
 *       - lang: JavaScript
 *         source: |
 *           const token = await mqAPI.getToken('myClientId', 'mySecret');
 *           // Returns: 'Bearer eyJhbGc...'
 */
async function getToken(
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const formData = new URLSearchParams();
  formData.append('grant_type', 'client_credentials');

  try {
    const response = await fetch(MQ_CONFIG.tokenUrl, {
      method: 'POST',
      body: formData,
      headers: {
        Authorization: 'Basic ' + btoa(`${clientId}:${clientSecret}`),
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    });

    if (response.ok) {
      const tokens = (await response.json()) as TokenResponse;
      const accessToken = tokens.access_token;
      return `Bearer ${accessToken}`;
    } else {
      throw new Error(
        `Failed to get token: ${response.status} ${response.statusText}`,
      );
    }
  } catch (error) {
    logger.error({ err: error, clientId }, 'Error in login');
    throw error;
  }
}

/**
 * @swagger
 * /mqAPI/getAPIVersion:
 *   get:
 *     description: Get MachineQ API version information
 *     responses:
 *       '200':
 *         description: Version object with Semantic, Major, Minor, and Patch properties
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MQVersion'
 *     x-code-samples:
 *       - lang: JavaScript
 *         source: |
 *           const version = await mqAPI.getAPIVersion();
 *           // Returns: { Semantic: '1.0.0', Major: '1', Minor: '0', Patch: '0' }
 */
async function getAPIVersion(): Promise<MQVersion> {
  const verUrl = `${MQ_CONFIG.apiUrl}/version`;
  try {
    const response = await fetch(verUrl);
    if (response.ok) {
      const data = (await response.json()) as MQVersion;
      return data;
    } else {
      // /version wasn't implemented before 1.0.0, set it to 0.4.0
      return { Semantic: '0.4.0', Major: '0', Minor: '4', Patch: '0' };
    }
  } catch (error) {
    logger.warn({ err: error }, 'Error getting API version');
    return { Semantic: '0.4.0', Major: '0', Minor: '4', Patch: '0' };
  }
}

//* GET Functions
/**
 * @swagger
 * /mqAPI/getAPICall:
 *   get:
 *     description: Generic function for API GET calls
 *     parameters:
 *       - name: endpoint
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *         description: API endpoint path (without base URL)
 *         example: "devices"
 *       - name: token
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *         description: Bearer token for authorization
 *     responses:
 *       '200':
 *         description: Response object with status and data or error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MQResponse'
 *     x-code-samples:
 *       - lang: JavaScript
 *         source: |
 *           const result = await mqAPI.getAPICall('devices', token);
 *           // Returns: { status: 200, data: [...] }
 */
async function getAPICall<T = unknown>(
  endpoint: string,
  token: string,
): Promise<MQResponse<T>> {
  const finalUrl = `${MQ_CONFIG.apiUrl}/${endpoint}`;
  const headers = { ...DEFAULT_HEADERS, Authorization: token };

  try {
    const response = await fetch(finalUrl, { headers });

    if (response.ok) {
      const data = (await response.json()) as T;
      return { status: response.status, data };
    } else {
      return { status: response.status, error: response.statusText };
    }
  } catch (error) {
    const err = error as Error;
    logger.error({ err: error, endpoint, url: finalUrl }, 'Error in API call');
    return { status: 500, error: err.message };
  }
}

/**
 * @swagger
 * /mqAPI/getDevices:
 *   get:
 *     description: Get all devices from MachineQ
 *     parameters:
 *       - name: token
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *         description: Bearer token for authorization
 *     responses:
 *       '200':
 *         description: Response object with devices data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MQResponse'
 *     x-code-samples:
 *       - lang: JavaScript
 *         source: |
 *           const result = await mqAPI.getDevices(token);
 *           // Returns: { status: 200, data: [...devices] }
 */
async function getDevices(token: string): Promise<MQResponse> {
  return getAPICall('devices', token);
}

/**
 * @swagger
 * /mqAPI/getGateways:
 *   get:
 *     description: Get all gateways from MachineQ
 *     parameters:
 *       - name: token
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *         description: Bearer token for authorization
 *     responses:
 *       '200':
 *         description: Response object with gateways data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MQResponse'
 *     x-code-samples:
 *       - lang: JavaScript
 *         source: |
 *           const result = await mqAPI.getGateways(token);
 *           // Returns: { status: 200, data: [...gateways] }
 */
async function getGateways(token: string): Promise<MQResponse> {
  return getAPICall('gateways', token);
}

/**
 * @swagger
 * /mqAPI/getAccount:
 *   get:
 *     description: Get account information from MachineQ
 *     parameters:
 *       - name: token
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *         description: Bearer token for authorization
 *     responses:
 *       '200':
 *         description: Response object with account data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MQResponse'
 *     x-code-samples:
 *       - lang: JavaScript
 *         source: |
 *           const result = await mqAPI.getAccount(token);
 *           // Returns: { status: 200, data: { ...account info } }
 */
async function getAccount(token: string): Promise<MQResponse> {
  return getAPICall('account', token);
}

//* POST Functions
/**
 * @swagger
 * /mqAPI/createDevice:
 *   post:
 *     description: Create a new device in MachineQ
 *     parameters:
 *       - name: token
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *         description: Bearer token for authorization
 *       - name: deviceData
 *         in: query
 *         required: true
 *         schema:
 *           type: object
 *           properties:
 *             Name:
 *               type: string
 *             DevEUI:
 *               type: string
 *         description: Device configuration object
 *     responses:
 *       '200':
 *         description: Response object with created device data or error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MQResponse'
 *     x-code-samples:
 *       - lang: JavaScript
 *         source: |
 *           const newDevice = await mqAPI.createDevice(token, {
 *             Name: 'MyDevice',
 *             DevEUI: '0000000000000001'
 *           });
 */
async function createDevice(
  token: string,
  deviceData: DeviceConfig,
): Promise<MQResponse> {
  const finalUrl = `${MQ_CONFIG.apiUrl}/devices`;
  const headers = { ...DEFAULT_HEADERS, Authorization: token };

  // Provide default values for required fields if not provided
  const defaultDeviceData: DeviceConfig = {
    ActivationType: 'OTAA',
    ServiceProfile: 'UyLtjJAT',
    DeviceProfile: 'zsi0h2lg',
    DecoderType: 'Nez4HkZe',
    OutputProfile: 'VvvcmU0o',
    PrivateData: false,
  };

  // Merge default data with provided data
  const finalDeviceData = { ...defaultDeviceData, ...deviceData };

  try {
    const response = await fetch(finalUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(finalDeviceData),
    });

    if (response.ok) {
      const data = await response.json();
      return { status: response.status, data };
    } else {
      // Try to get more detailed error information
      let errorData: string | object;
      try {
        errorData = (await response.json()) as object;
      } catch {
        errorData = response.statusText;
      }

      return { status: response.status, error: errorData };
    }
  } catch (error) {
    const err = error as Error;
    logger.error(
      { err: error, deviceData: finalDeviceData },
      'Error creating device',
    );
    return { status: 500, error: err.message };
  }
}

// Default export for use in analyses processes
export default {
  getAPIVersion,
  getDevices,
  getGateways,
  getAccount,
  getAPICall,
  getToken,
  createDevice,
  config: MQ_CONFIG,
};
