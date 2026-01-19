/**
 * Impersonation Guard Middleware Tests
 *
 * Tests the middleware that blocks profile operations during impersonation.
 * When an admin impersonates a user, they should not be able to modify
 * that user's profile (password, email, etc.).
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// Create hoisted mocks that can be used in vi.mock factories
const { mockGetSession, mockLogger } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockLogger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock the auth module
vi.mock('../../src/lib/auth.ts', () => ({
  auth: {
    api: {
      getSession: mockGetSession,
    },
  },
}));

// Mock the logger
vi.mock('../../src/utils/logging/logger.ts', () => ({
  createChildLogger: vi.fn(() => mockLogger),
}));

// Mock better-auth/node
vi.mock('better-auth/node', () => ({
  fromNodeHeaders: vi.fn((headers) => headers),
}));

// Import after mocks
import { impersonationGuard } from '../../src/middleware/impersonationGuard.ts';

type MockRequest = Partial<Request> & {
  path: string;
  headers: Record<string, string>;
};

type MockResponse = Partial<Response> & {
  status: Mock;
  json: Mock;
};

function createMockRequest(path = '/'): MockRequest {
  return {
    path,
    headers: {
      cookie: 'session=test-session',
    },
  };
}

function createMockResponse(): MockResponse {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res;
}

function createMockNext(): Mock {
  return vi.fn();
}

describe('impersonationGuard middleware', () => {
  let req: MockRequest;
  let res: MockResponse;
  let next: Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    req = createMockRequest();
    res = createMockResponse();
    next = createMockNext();
  });

  describe('non-blocked paths', () => {
    it('should call next for non-profile paths', async () => {
      req = createMockRequest('/api/analyses');

      await impersonationGuard(
        req as unknown as Request,
        res as unknown as Response,
        next as NextFunction,
      );

      expect(next).toHaveBeenCalled();
      expect(mockGetSession).not.toHaveBeenCalled();
    });

    it('should call next for root path', async () => {
      req = createMockRequest('/');

      await impersonationGuard(
        req as unknown as Request,
        res as unknown as Response,
        next as NextFunction,
      );

      expect(next).toHaveBeenCalled();
    });

    it('should call next for random paths', async () => {
      req = createMockRequest('/some/random/path');

      await impersonationGuard(
        req as unknown as Request,
        res as unknown as Response,
        next as NextFunction,
      );

      expect(next).toHaveBeenCalled();
      expect(mockGetSession).not.toHaveBeenCalled();
    });
  });

  describe('blocked paths - update-user', () => {
    it('should allow update-user when not impersonating', async () => {
      req = createMockRequest('/update-user');
      mockGetSession.mockResolvedValue({
        session: { id: 'session-1' },
        user: { id: 'user-1' },
      });

      await impersonationGuard(
        req as unknown as Request,
        res as unknown as Response,
        next as NextFunction,
      );

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should block update-user when impersonating', async () => {
      req = createMockRequest('/update-user');
      mockGetSession.mockResolvedValue({
        session: { id: 'session-1', impersonatedBy: 'admin-user-id' },
        user: { id: 'user-1' },
      });

      await impersonationGuard(
        req as unknown as Request,
        res as unknown as Response,
        next as NextFunction,
      );

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Profile changes are not allowed while impersonating',
        code: 'IMPERSONATION_PROFILE_BLOCKED',
      });
    });
  });

  describe('blocked paths - change-password', () => {
    it('should allow change-password when not impersonating', async () => {
      req = createMockRequest('/change-password');
      mockGetSession.mockResolvedValue({
        session: { id: 'session-1' },
        user: { id: 'user-1' },
      });

      await impersonationGuard(
        req as unknown as Request,
        res as unknown as Response,
        next as NextFunction,
      );

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should block change-password when impersonating', async () => {
      req = createMockRequest('/change-password');
      mockGetSession.mockResolvedValue({
        session: { id: 'session-1', impersonatedBy: 'admin-user-id' },
        user: { id: 'user-1' },
      });

      await impersonationGuard(
        req as unknown as Request,
        res as unknown as Response,
        next as NextFunction,
      );

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Profile changes are not allowed while impersonating',
        code: 'IMPERSONATION_PROFILE_BLOCKED',
      });
    });
  });

  describe('blocked paths - change-email', () => {
    it('should allow change-email when not impersonating', async () => {
      req = createMockRequest('/change-email');
      mockGetSession.mockResolvedValue({
        session: { id: 'session-1' },
        user: { id: 'user-1' },
      });

      await impersonationGuard(
        req as unknown as Request,
        res as unknown as Response,
        next as NextFunction,
      );

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should block change-email when impersonating', async () => {
      req = createMockRequest('/change-email');
      mockGetSession.mockResolvedValue({
        session: { id: 'session-1', impersonatedBy: 'admin-user-id' },
        user: { id: 'user-1' },
      });

      await impersonationGuard(
        req as unknown as Request,
        res as unknown as Response,
        next as NextFunction,
      );

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Profile changes are not allowed while impersonating',
        code: 'IMPERSONATION_PROFILE_BLOCKED',
      });
    });
  });

  describe('error handling', () => {
    it('should call next when session check fails', async () => {
      req = createMockRequest('/update-user');
      mockGetSession.mockRejectedValue(new Error('Session check failed'));

      await impersonationGuard(
        req as unknown as Request,
        res as unknown as Response,
        next as NextFunction,
      );

      // Should continue despite error
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should call next when session is null', async () => {
      req = createMockRequest('/update-user');
      mockGetSession.mockResolvedValue(null);

      await impersonationGuard(
        req as unknown as Request,
        res as unknown as Response,
        next as NextFunction,
      );

      expect(next).toHaveBeenCalled();
    });

    it('should call next when session has no impersonatedBy field', async () => {
      req = createMockRequest('/update-user');
      mockGetSession.mockResolvedValue({
        session: { id: 'session-1' },
        user: { id: 'user-1' },
      });

      await impersonationGuard(
        req as unknown as Request,
        res as unknown as Response,
        next as NextFunction,
      );

      expect(next).toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle empty impersonatedBy string', async () => {
      req = createMockRequest('/update-user');
      mockGetSession.mockResolvedValue({
        session: { id: 'session-1', impersonatedBy: '' },
        user: { id: 'user-1' },
      });

      await impersonationGuard(
        req as unknown as Request,
        res as unknown as Response,
        next as NextFunction,
      );

      // Empty string is falsy, so should allow
      expect(next).toHaveBeenCalled();
    });

    it('should handle undefined session in result', async () => {
      req = createMockRequest('/update-user');
      mockGetSession.mockResolvedValue({
        session: undefined,
        user: { id: 'user-1' },
      });

      await impersonationGuard(
        req as unknown as Request,
        res as unknown as Response,
        next as NextFunction,
      );

      expect(next).toHaveBeenCalled();
    });

    it('should check all blocked paths correctly', async () => {
      const blockedPaths = [
        '/update-user',
        '/change-password',
        '/change-email',
      ];

      for (const path of blockedPaths) {
        vi.clearAllMocks();
        req = createMockRequest(path);
        mockGetSession.mockResolvedValue({
          session: { id: 'session-1', impersonatedBy: 'admin-id' },
          user: { id: 'user-1' },
        });

        await impersonationGuard(
          req as unknown as Request,
          res as unknown as Response,
          next as NextFunction,
        );

        expect(res.status).toHaveBeenCalledWith(403);
      }
    });
  });
});
