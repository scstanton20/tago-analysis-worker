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
  error?: string | MQErrorResponse;
}

/** OAuth token response */
interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

/** Delete device response */
interface DeleteDeviceResponse {
  response: boolean;
}

/** Delete device error response */
interface MQErrorResponse {
  code: number;
  message: string;
  details: ReadonlyArray<{ typeUrl: string; value: string }>;
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
      let errorData: string | MQErrorResponse;
      try {
        errorData = (await response.json()) as MQErrorResponse;
      } catch {
        errorData = response.statusText;
      }
      return { status: response.status, error: errorData };
    }
  } catch (error) {
    const err = error as Error;
    logger.error({ err: error, endpoint, url: finalUrl }, 'Error in API call');
    return { status: 500, error: err.message };
  }
}

async function getDevices(token: string): Promise<MQResponse> {
  return getAPICall('devices', token);
}

async function getGateways(token: string): Promise<MQResponse> {
  return getAPICall('gateways', token);
}

async function getAccount(token: string): Promise<MQResponse> {
  return getAPICall('account', token);
}

//* POST Functions
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
      let errorData: string | MQErrorResponse;
      try {
        errorData = (await response.json()) as MQErrorResponse;
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

async function deleteDevice(
  token: string,
  devEUI: string,
): Promise<MQResponse<DeleteDeviceResponse>> {
  const finalUrl = `${MQ_CONFIG.apiUrl}/devices/${devEUI}`;
  const headers = { ...DEFAULT_HEADERS, Authorization: token };

  try {
    const response = await fetch(finalUrl, {
      method: 'DELETE',
      headers,
    });

    if (response.ok) {
      const data = (await response.json()) as DeleteDeviceResponse;
      return { status: response.status, data };
    } else {
      let errorData: string | MQErrorResponse;
      try {
        errorData = (await response.json()) as MQErrorResponse;
      } catch {
        errorData = response.statusText;
      }
      return { status: response.status, error: errorData };
    }
  } catch (error) {
    const err = error as Error;
    logger.error({ err: error, devEUI }, 'Error deleting device');
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
  deleteDevice,
  config: MQ_CONFIG,
};
