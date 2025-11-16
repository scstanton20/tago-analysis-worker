import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger
vi.mock('../../src/utils/logging/logger.js', () => ({
  createChildLogger: vi.fn(() => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  })),
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;
global.btoa = (str) => Buffer.from(str).toString('base64');

describe('mqAPI', () => {
  let mqAPI;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import('../../src/utils/mqAPI.js');
    mqAPI = module.default;
  });

  describe('getToken', () => {
    it('should return Bearer token on successful authentication', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: 'test-token-123' }),
      });

      const token = await mqAPI.getToken('client-id', 'client-secret');

      expect(token).toBe('Bearer test-token-123');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://oauth.machineq.net/oauth2/token',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: expect.stringContaining('Basic '),
          }),
        }),
      );
    });

    it('should throw error on authentication failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      await expect(mqAPI.getToken('bad-id', 'bad-secret')).rejects.toThrow(
        'Failed to get token: 401 Unauthorized',
      );
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(mqAPI.getToken('client-id', 'secret')).rejects.toThrow(
        'Network error',
      );
    });

    it('should encode credentials in Base64', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: 'token' }),
      });

      await mqAPI.getToken('user123', 'pass456');

      const authHeader = mockFetch.mock.calls[0][1].headers.Authorization;
      expect(authHeader).toContain('Basic ');
    });
  });

  describe('getAPIVersion', () => {
    it('should return version on successful response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          Semantic: '1.2.3',
          Major: '1',
          Minor: '2',
          Patch: '3',
        }),
      });

      const version = await mqAPI.getAPIVersion();

      expect(version.Semantic).toBe('1.2.3');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.machineq.net/v1/version',
      );
    });

    it('should return default version on 404', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
      });

      const version = await mqAPI.getAPIVersion();

      expect(version.Semantic).toBe('0.4.0');
    });

    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'));

      const version = await mqAPI.getAPIVersion();

      expect(version.Semantic).toBe('0.4.0');
    });
  });

  describe('getAPICall', () => {
    it('should make GET request with authorization', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: 'test' }),
      });

      const result = await mqAPI.getAPICall('devices', 'Bearer token-123');

      expect(result.status).toBe(200);
      expect(result.data).toEqual({ data: 'test' });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.machineq.net/v1/devices',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer token-123',
          }),
        }),
      );
    });

    it('should return error on failed request', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const result = await mqAPI.getAPICall('invalid', 'Bearer token');

      expect(result.status).toBe(404);
      expect(result.error).toBe('Not Found');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Timeout'));

      const result = await mqAPI.getAPICall('devices', 'Bearer token');

      expect(result.status).toBe(500);
      expect(result.error).toBe('Timeout');
    });
  });

  describe('getDevices', () => {
    it('should call getAPICall with devices endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ devices: [] }),
      });

      const result = await mqAPI.getDevices('Bearer token');

      expect(result.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.machineq.net/v1/devices',
        expect.any(Object),
      );
    });
  });

  describe('getGateways', () => {
    it('should call getAPICall with gateways endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ gateways: [] }),
      });

      const result = await mqAPI.getGateways('Bearer token');

      expect(result.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.machineq.net/v1/gateways',
        expect.any(Object),
      );
    });
  });

  describe('getAccount', () => {
    it('should call getAPICall with account endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ account: {} }),
      });

      const result = await mqAPI.getAccount('Bearer token');

      expect(result.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.machineq.net/v1/account',
        expect.any(Object),
      );
    });
  });

  describe('createDevice', () => {
    it('should create device with provided data', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ device: { id: '123' } }),
      });

      const deviceData = {
        DevEUI: '0123456789ABCDEF',
        AppEUI: 'FEDCBA9876543210',
      };

      const result = await mqAPI.createDevice('Bearer token', deviceData);

      expect(result.status).toBe(201);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.machineq.net/v1/devices',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('DevEUI'),
        }),
      );
    });

    it('should merge default device data', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ device: {} }),
      });

      await mqAPI.createDevice('Bearer token', {
        DevEUI: '0123456789ABCDEF',
      });

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.ActivationType).toBe('OTAA');
      expect(requestBody.ServiceProfile).toBe('UyLtjJAT');
      expect(requestBody.DeviceProfile).toBe('zsi0h2lg');
    });

    it('should handle creation errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Invalid DevEUI' }),
      });

      const result = await mqAPI.createDevice('Bearer token', {});

      expect(result.status).toBe(400);
      expect(result.error).toEqual({ error: 'Invalid DevEUI' });
    });

    it('should handle non-JSON error responses', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => {
          throw new Error('Not JSON');
        },
      });

      const result = await mqAPI.createDevice('Bearer token', {});

      expect(result.status).toBe(500);
      expect(result.error).toBe('Internal Server Error');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Connection timeout'));

      const result = await mqAPI.createDevice('Bearer token', {});

      expect(result.status).toBe(500);
      expect(result.error).toBe('Connection timeout');
    });
  });

  describe('config export', () => {
    it('should export MQ_CONFIG', () => {
      expect(mqAPI.config).toBeDefined();
      expect(mqAPI.config.tokenUrl).toContain('machineq.net');
      expect(mqAPI.config.apiUrl).toContain('api.machineq.net');
    });
  });

  describe('named exports', () => {
    it('should provide named exports for all functions', () => {
      expect(mqAPI.getAPIVersion).toBeDefined();
      expect(mqAPI.getDevices).toBeDefined();
      expect(mqAPI.getGateways).toBeDefined();
      expect(mqAPI.getAccount).toBeDefined();
      expect(mqAPI.getToken).toBeDefined();
      expect(mqAPI.createDevice).toBeDefined();
      expect(mqAPI.config).toBeDefined();
    });
  });
});
