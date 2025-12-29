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
 * Login via OAuth to get access token
 * @param clientId - OAuth client ID from MachineQ
 * @param clientSecret - OAuth client secret from MachineQ
 * @returns Bearer token for API authentication
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
 * Get MachineQ API version information
 * @returns Version object with Semantic, Major, Minor, and Patch properties
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

/**
 * Generic function for API GET calls
 * @param endpoint - API endpoint path (without base URL)
 * @param token - Bearer token for authorization
 * @returns Response object with status and data or error
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
 * Get all devices from MachineQ
 * @param token - Bearer token for authorization
 * @returns Response object with devices data
 */
async function getDevices(token: string): Promise<MQResponse> {
  return getAPICall('devices', token);
}

/**
 * Get all gateways from MachineQ
 * @param token - Bearer token for authorization
 * @returns Response object with gateways data
 */
async function getGateways(token: string): Promise<MQResponse> {
  return getAPICall('gateways', token);
}

/**
 * Get account information from MachineQ
 * @param token - Bearer token for authorization
 * @returns Response object with account data
 */
async function getAccount(token: string): Promise<MQResponse> {
  return getAPICall('account', token);
}

/**
 * Create a new device in MachineQ
 * @param token - Bearer token for authorization
 * @param deviceData - Device configuration object
 * @returns Response object with created device data or error
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
