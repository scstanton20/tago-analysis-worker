/**
 * Comprehensive Unit Tests for InitDataService
 *
 * This test suite ensures full coverage of the SSE InitDataService,
 * testing all branch conditions, error paths, and edge cases.
 *
 * Coverage targets:
 * - sendInitialData: Admin/non-admin filtering, user not found, errors
 * - refreshInitDataForUser: No sessions, disconnected sessions, errors
 * - sendStatusUpdate: Container states, running analyses count, errors
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type MockInstance,
} from 'vitest';
import type { Session } from '../../../src/utils/sse/utils.ts';
import type { Analysis, Team } from '@tago-analysis-worker/types';

// Create a shared mock logger that can be accessed by tests
const sharedMockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  child: vi.fn().mockReturnThis(),
};

// Mock dependencies before importing the module
vi.mock('../../../src/utils/logging/logger.ts', () => ({
  createChildLogger: vi.fn(() => sharedMockLogger),
}));

vi.mock('../../../src/utils/packageVersion.ts', () => ({
  getPackageVersion: vi.fn(() => '1.0.0'),
}));

vi.mock('ms', () => ({
  default: vi.fn((ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${Math.floor(ms / 1000)}s`;
    return `${Math.floor(ms / 60000)}m`;
  }),
}));

// Create mocked services that we can control in tests
const mockAnalysisService = {
  getAllAnalyses: vi.fn(),
  getConfig: vi.fn(),
};

const mockTeamService = {
  getAllTeams: vi.fn(),
};

const mockGetUserTeamIds = vi.fn();
const mockExecuteQuery = vi.fn();

vi.mock('../../../src/services/analysis/index.ts', () => ({
  analysisService: mockAnalysisService,
}));

vi.mock('../../../src/services/teamService.ts', () => ({
  teamService: mockTeamService,
}));

vi.mock('../../../src/middleware/betterAuthMiddleware.ts', () => ({
  getUserTeamIds: mockGetUserTeamIds,
}));

vi.mock('../../../src/utils/authDatabase.ts', () => ({
  executeQuery: mockExecuteQuery,
}));

// Mock the lazy loaders to return our controlled mocks
vi.mock('../../../src/utils/lazyLoader.ts', () => ({
  getAnalysisService: vi.fn(() => Promise.resolve(mockAnalysisService)),
  getTeamService: vi.fn(() => Promise.resolve(mockTeamService)),
  getTeamPermissionHelpers: vi.fn(() =>
    Promise.resolve({ getUserTeamIds: mockGetUserTeamIds }),
  ),
  getAuthDatabase: vi.fn(() =>
    Promise.resolve({ executeQuery: mockExecuteQuery }),
  ),
  getMs: vi.fn(() =>
    Promise.resolve((ms: number) => {
      if (ms < 1000) return `${ms}ms`;
      if (ms < 60000) return `${Math.floor(ms / 1000)}s`;
      return `${Math.floor(ms / 60000)}m`;
    }),
  ),
  getSseManager: vi.fn(),
  getDnsCache: vi.fn(),
}));

/**
 * Mock Session type for testing
 */
interface MockSession extends Omit<Session, 'push'> {
  push: MockInstance & ((data: unknown) => Promise<void>);
}

/**
 * Create a mock client session for testing
 */
function createMockClient(userId = 'test-user-123'): MockSession {
  return {
    id: `session-${Math.random().toString(36).substring(7)}`,
    push: vi.fn().mockResolvedValue(undefined),
    state: {
      userId,
      user: {
        id: userId,
        role: 'user',
        email: 'test@example.com',
        name: 'Test User',
      },
      subscribedChannels: new Set(),
    },
    isConnected: true,
  };
}

/**
 * Create a mock SSEManager for testing
 */
function createMockSSEManager() {
  return {
    sessionManager: {
      getSessionsByUserId: vi.fn().mockReturnValue([]),
    },
    getContainerState: vi.fn().mockReturnValue({
      status: 'ready',
      startTime: new Date(),
      message: 'Container is ready',
    }),
  };
}

describe('InitDataService', () => {
  let mockSSEManager: ReturnType<typeof createMockSSEManager>;
  let mockAnalysisService: {
    getAllAnalyses: MockInstance;
    getConfig: MockInstance;
    analyses?: Map<string, { status: string }>;
  };
  let mockTeamService: { getAllTeams: MockInstance };
  let mockGetUserTeamIds: MockInstance;
  let mockExecuteQuery: MockInstance;

  let InitDataService: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Clear the shared mock logger
    sharedMockLogger.info.mockClear();
    sharedMockLogger.error.mockClear();
    sharedMockLogger.warn.mockClear();
    sharedMockLogger.debug.mockClear();

    mockSSEManager = createMockSSEManager();

    // Import mocked modules
    const analysisModule =
      await import('../../../src/services/analysis/index.ts');
    mockAnalysisService =
      analysisModule.analysisService as unknown as typeof mockAnalysisService;

    const teamModule = await import('../../../src/services/teamService.ts');
    mockTeamService =
      teamModule.teamService as unknown as typeof mockTeamService;

    const authMiddlewareModule =
      await import('../../../src/middleware/betterAuthMiddleware.ts');
    mockGetUserTeamIds =
      authMiddlewareModule.getUserTeamIds as unknown as MockInstance;

    const authDbModule = await import('../../../src/utils/authDatabase.ts');
    mockExecuteQuery = authDbModule.executeQuery as unknown as MockInstance;

    // Import InitDataService after mocks are set up
    const serviceModule =
      await import('../../../src/utils/sse/InitDataService.ts');
    InitDataService = serviceModule.InitDataService;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ========================================================================
  // sendInitialData Tests
  // ========================================================================

  describe('sendInitialData', () => {
    let service: any;

    beforeEach(() => {
      service = new InitDataService(mockSSEManager as any);
    });

    describe('Happy path - Admin user', () => {
      it('should send initial data to admin user with all analyses and teams', async () => {
        const client = createMockClient('admin-123');
        client.state.user.role = 'admin';

        const mockAnalyses: Record<string, Analysis> = {
          'analysis-1': {
            id: 'analysis-1',
            name: 'Analysis 1',
            teamId: 'team-1',
            status: 'stopped',
            enabled: true,
            intendedState: 'stopped',
            lastStartTime: null,
            created: new Date().toISOString(),
          },
          'analysis-2': {
            id: 'analysis-2',
            name: 'Analysis 2',
            teamId: 'team-2',
            status: 'stopped',
            enabled: true,
            intendedState: 'stopped',
            lastStartTime: null,
            created: new Date().toISOString(),
          },
        };

        const mockTeams: Team[] = [
          {
            id: 'team-1',
            name: 'Team 1',
            color: '#3B82F6',
            orderIndex: 0,
            isSystem: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: 'team-2',
            name: 'Team 2',
            color: '#10B981',
            orderIndex: 1,
            isSystem: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ];

        mockExecuteQuery.mockReturnValue({
          id: 'admin-123',
          role: 'admin',
          email: 'admin@example.com',
          name: 'Admin User',
        });

        mockAnalysisService.getAllAnalyses.mockResolvedValue(mockAnalyses);
        mockTeamService.getAllTeams.mockResolvedValue(mockTeams);
        mockAnalysisService.getConfig.mockResolvedValue({
          teamStructure: {
            'team-1': { folders: [] },
            'team-2': { folders: [] },
          },
        });

        await service.sendInitialData(client);

        expect(client.push).toHaveBeenCalled();
        const pushCall = client.push.mock.calls[0][0];
        expect(pushCall).toEqual(
          expect.objectContaining({
            type: 'init',
            sessionId: client.id,
            analyses: mockAnalyses,
            teams: expect.objectContaining({
              'team-1': expect.any(Object),
              'team-2': expect.any(Object),
            }),
          }),
        );
      });

      it('should send status update after initial data for admin', async () => {
        const client = createMockClient('admin-123');
        client.state.user.role = 'admin';

        mockExecuteQuery.mockReturnValue({
          id: 'admin-123',
          role: 'admin',
          email: 'admin@example.com',
          name: 'Admin User',
        });

        mockAnalysisService.getAllAnalyses.mockResolvedValue({});
        mockTeamService.getAllTeams.mockResolvedValue([]);
        mockAnalysisService.getConfig.mockResolvedValue({});

        await service.sendInitialData(client);

        expect(client.push).toHaveBeenCalledTimes(2);
      });
    });

    describe('Happy path - Non-admin user', () => {
      it('should filter analyses and teams for non-admin user', async () => {
        const client = createMockClient('user-456');
        client.state.user.role = 'user';

        const mockAnalyses: Record<string, Analysis> = {
          'analysis-1': {
            id: 'analysis-1',
            name: 'Analysis 1',
            teamId: 'team-1',
            status: 'stopped',
            enabled: true,
            intendedState: 'stopped',
            lastStartTime: null,
            created: new Date().toISOString(),
          },
          'analysis-2': {
            id: 'analysis-2',
            name: 'Analysis 2',
            teamId: 'team-2',
            status: 'stopped',
            enabled: true,
            intendedState: 'stopped',
            lastStartTime: null,
            created: new Date().toISOString(),
          },
        };

        const mockTeams: Team[] = [
          {
            id: 'team-1',
            name: 'Team 1',
            color: '#3B82F6',
            orderIndex: 0,
            isSystem: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: 'team-2',
            name: 'Team 2',
            color: '#10B981',
            orderIndex: 1,
            isSystem: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ];

        mockExecuteQuery.mockReturnValue({
          id: 'user-456',
          role: 'user',
          email: 'user@example.com',
          name: 'Regular User',
        });

        mockAnalysisService.getAllAnalyses.mockResolvedValue(mockAnalyses);
        mockTeamService.getAllTeams.mockResolvedValue(mockTeams);
        mockGetUserTeamIds.mockReturnValue(['team-1']);
        mockAnalysisService.getConfig.mockResolvedValue({
          teamStructure: {
            'team-1': { folders: [] },
            'team-2': { folders: [] },
          },
        });

        await service.sendInitialData(client);

        const pushCall = client.push.mock.calls[0][0] as {
          analyses: Record<string, unknown>;
          teams: Record<string, unknown>;
        };
        expect(pushCall.analyses).toEqual({
          'analysis-1': mockAnalyses['analysis-1'],
        });
        expect(pushCall.teams).toEqual(
          expect.objectContaining({
            'team-1': expect.any(Object),
          }),
        );
        expect(pushCall.teams['team-2']).toBeUndefined();
      });

      it('should only include allowed team structures for non-admin user', async () => {
        const client = createMockClient('user-456');
        client.state.user.role = 'user';

        mockExecuteQuery.mockReturnValue({
          id: 'user-456',
          role: 'user',
          email: 'user@example.com',
          name: 'Regular User',
        });

        mockAnalysisService.getAllAnalyses.mockResolvedValue({});
        mockTeamService.getAllTeams.mockResolvedValue([]);
        mockGetUserTeamIds.mockReturnValue(['team-1']);
        mockAnalysisService.getConfig.mockResolvedValue({
          teamStructure: {
            'team-1': { folders: ['folder1'] },
            'team-2': { folders: ['folder2'] },
          },
        });

        await service.sendInitialData(client);

        const pushCall = client.push.mock.calls[0][0] as {
          teamStructure: Record<string, unknown>;
        };
        expect(pushCall.teamStructure).toEqual({
          'team-1': { folders: ['folder1'] },
        });
        expect(pushCall.teamStructure['team-2']).toBeUndefined();
      });

      it('should handle analyses with uncategorized team ID', async () => {
        const client = createMockClient('user-456');
        client.state.user.role = 'user';

        const mockAnalyses: Record<string, Analysis> = {
          'uncategorized-analysis': {
            id: 'uncategorized-analysis',
            name: 'Uncategorized',
            teamId: 'uncategorized',
            status: 'stopped',
            enabled: true,
            intendedState: 'stopped',
            lastStartTime: null,
            created: new Date().toISOString(),
          },
        };

        mockExecuteQuery.mockReturnValue({
          id: 'user-456',
          role: 'user',
          email: 'user@example.com',
          name: 'Regular User',
        });

        mockAnalysisService.getAllAnalyses.mockResolvedValue(mockAnalyses);
        mockTeamService.getAllTeams.mockResolvedValue([]);
        mockGetUserTeamIds.mockReturnValue(['uncategorized']);
        mockAnalysisService.getConfig.mockResolvedValue({});

        await service.sendInitialData(client);

        const pushCall = client.push.mock.calls[0][0] as {
          analyses: Record<string, unknown>;
        };
        expect(pushCall.analyses).toEqual({
          'uncategorized-analysis': mockAnalyses['uncategorized-analysis'],
        });
      });
    });

    describe('Error handling - User not found', () => {
      it('should return early if user not found in database', async () => {
        const client = createMockClient('nonexistent-user');

        mockExecuteQuery.mockReturnValue(null);

        await service.sendInitialData(client);

        expect(client.push).not.toHaveBeenCalled();
      });

      it('should log error when user not found', async () => {
        const client = createMockClient('nonexistent-user');

        mockExecuteQuery.mockReturnValue(null);

        await service.sendInitialData(client);

        expect(sharedMockLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({ userId: 'nonexistent-user' }),
          expect.stringContaining('User not found'),
        );
      });
    });

    describe('Error handling - Service errors', () => {
      it('should handle errors from analysisService.getAllAnalyses', async () => {
        const client = createMockClient();

        mockExecuteQuery.mockReturnValue({
          id: 'test-user-123',
          role: 'admin',
          email: 'test@example.com',
          name: 'Test User',
        });

        mockAnalysisService.getAllAnalyses.mockRejectedValue(
          new Error('Database error'),
        );

        await service.sendInitialData(client);

        expect(sharedMockLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({ error: expect.any(Error) }),
          expect.stringContaining('Error sending initial SSE data'),
        );
      });

      it('should handle errors from teamService.getAllTeams', async () => {
        const client = createMockClient();

        mockExecuteQuery.mockReturnValue({
          id: 'test-user-123',
          role: 'admin',
          email: 'test@example.com',
          name: 'Test User',
        });

        mockAnalysisService.getAllAnalyses.mockResolvedValue({});
        mockTeamService.getAllTeams.mockRejectedValue(
          new Error('Team service error'),
        );

        await service.sendInitialData(client);

        expect(sharedMockLogger.error).toHaveBeenCalled();
      });

      it('should handle errors from client.push', async () => {
        const client = createMockClient();
        client.push.mockRejectedValue(new Error('Push failed'));

        mockExecuteQuery.mockReturnValue({
          id: 'test-user-123',
          role: 'admin',
          email: 'test@example.com',
          name: 'Test User',
        });

        mockAnalysisService.getAllAnalyses.mockResolvedValue({});
        mockTeamService.getAllTeams.mockResolvedValue([]);
        mockAnalysisService.getConfig.mockResolvedValue({});

        await service.sendInitialData(client);

        expect(sharedMockLogger.error).toHaveBeenCalled();
      });
    });

    describe('Edge cases', () => {
      it('should handle empty analyses and teams', async () => {
        const client = createMockClient('admin-123');
        client.state.user.role = 'admin';

        mockExecuteQuery.mockReturnValue({
          id: 'admin-123',
          role: 'admin',
          email: 'admin@example.com',
          name: 'Admin User',
        });

        mockAnalysisService.getAllAnalyses.mockResolvedValue({});
        mockTeamService.getAllTeams.mockResolvedValue([]);
        mockAnalysisService.getConfig.mockResolvedValue({});

        await service.sendInitialData(client);

        const pushCall = client.push.mock.calls[0][0] as {
          analyses: Record<string, unknown>;
          teams: Record<string, unknown>;
          teamStructure: Record<string, unknown>;
        };
        expect(pushCall.analyses).toEqual({});
        expect(pushCall.teams).toEqual({});
        expect(pushCall.teamStructure).toEqual({});
      });

      it('should handle missing config.teamStructure', async () => {
        const client = createMockClient();

        mockExecuteQuery.mockReturnValue({
          id: 'test-user-123',
          role: 'admin',
          email: 'test@example.com',
          name: 'Test User',
        });

        mockAnalysisService.getAllAnalyses.mockResolvedValue({});
        mockTeamService.getAllTeams.mockResolvedValue([]);
        mockAnalysisService.getConfig.mockResolvedValue({});

        await service.sendInitialData(client);

        const pushCall = client.push.mock.calls[0][0] as {
          teamStructure: Record<string, unknown>;
        };
        expect(pushCall.teamStructure).toEqual({});
      });

      it('should convert team array to object keyed by ID', async () => {
        const client = createMockClient();

        mockExecuteQuery.mockReturnValue({
          id: 'test-user-123',
          role: 'admin',
          email: 'test@example.com',
          name: 'Test User',
        });

        const mockTeams: Team[] = [
          {
            id: 'team-1',
            name: 'Team 1',
            color: '#3B82F6',
            orderIndex: 0,
            isSystem: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: 'team-2',
            name: 'Team 2',
            color: '#10B981',
            orderIndex: 1,
            isSystem: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ];

        mockAnalysisService.getAllAnalyses.mockResolvedValue({});
        mockTeamService.getAllTeams.mockResolvedValue(mockTeams);
        mockAnalysisService.getConfig.mockResolvedValue({});

        await service.sendInitialData(client);

        const pushCall = client.push.mock.calls[0][0] as {
          teams: Record<string, unknown>;
        };
        expect(pushCall.teams).toHaveProperty('team-1');
        expect(pushCall.teams).toHaveProperty('team-2');
      });
    });
  });

  // ========================================================================
  // refreshInitDataForUser Tests
  // ========================================================================

  describe('refreshInitDataForUser', () => {
    let service: any;

    beforeEach(() => {
      service = new InitDataService(mockSSEManager as any);
    });

    describe('Happy path', () => {
      it('should refresh init data for all connected user sessions', async () => {
        const mockSession1 = createMockClient('user-123');
        const mockSession2 = createMockClient('user-123');

        mockSSEManager.sessionManager.getSessionsByUserId.mockReturnValue([
          mockSession1,
          mockSession2,
        ]);

        mockExecuteQuery.mockReturnValue({
          id: 'user-123',
          role: 'user',
          email: 'user@example.com',
          name: 'Test User',
        });

        mockAnalysisService.getAllAnalyses.mockResolvedValue({});
        mockTeamService.getAllTeams.mockResolvedValue([]);
        mockGetUserTeamIds.mockReturnValue([]);
        mockAnalysisService.getConfig.mockResolvedValue({});

        const result = await service.refreshInitDataForUser('user-123');

        expect(result).toBe(2);
        expect(mockSession1.push).toHaveBeenCalled();
        expect(mockSession2.push).toHaveBeenCalled();
      });

      it('should return count of refreshed sessions', async () => {
        const mockSession = createMockClient('user-123');

        mockSSEManager.sessionManager.getSessionsByUserId.mockReturnValue([
          mockSession,
        ]);

        mockExecuteQuery.mockReturnValue({
          id: 'user-123',
          role: 'user',
          email: 'user@example.com',
          name: 'Test User',
        });

        mockAnalysisService.getAllAnalyses.mockResolvedValue({});
        mockTeamService.getAllTeams.mockResolvedValue([]);
        mockGetUserTeamIds.mockReturnValue([]);
        mockAnalysisService.getConfig.mockResolvedValue({});

        const result = await service.refreshInitDataForUser('user-123');

        expect(result).toBe(1);
      });
    });

    describe('No sessions found', () => {
      it('should return 0 if no sessions found for user', async () => {
        mockSSEManager.sessionManager.getSessionsByUserId.mockReturnValue([]);

        const result = await service.refreshInitDataForUser('nonexistent-user');

        expect(result).toBe(0);
      });

      it('should log debug message when no sessions found', async () => {
        mockSSEManager.sessionManager.getSessionsByUserId.mockReturnValue([]);

        await service.refreshInitDataForUser('nonexistent-user');

        expect(sharedMockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({ userId: 'nonexistent-user' }),
          expect.stringContaining('No SSE sessions found'),
        );
      });
    });

    describe('Disconnected sessions', () => {
      it('should skip disconnected sessions', async () => {
        const connectedSession = createMockClient('user-123');
        const disconnectedSession = createMockClient('user-123');
        disconnectedSession.isConnected = false;

        mockSSEManager.sessionManager.getSessionsByUserId.mockReturnValue([
          connectedSession,
          disconnectedSession,
        ]);

        mockExecuteQuery.mockReturnValue({
          id: 'user-123',
          role: 'user',
          email: 'user@example.com',
          name: 'Test User',
        });

        mockAnalysisService.getAllAnalyses.mockResolvedValue({});
        mockTeamService.getAllTeams.mockResolvedValue([]);
        mockGetUserTeamIds.mockReturnValue([]);
        mockAnalysisService.getConfig.mockResolvedValue({});

        const result = await service.refreshInitDataForUser('user-123');

        expect(result).toBe(1);
        expect(connectedSession.push).toHaveBeenCalled();
        expect(disconnectedSession.push).not.toHaveBeenCalled();
      });

      it('should count only connected sessions as refreshed', async () => {
        const sessions = [
          createMockClient('user-123'),
          createMockClient('user-123'),
          createMockClient('user-123'),
        ];
        sessions[1].isConnected = false;

        mockSSEManager.sessionManager.getSessionsByUserId.mockReturnValue(
          sessions,
        );

        mockExecuteQuery.mockReturnValue({
          id: 'user-123',
          role: 'user',
          email: 'user@example.com',
          name: 'Test User',
        });

        mockAnalysisService.getAllAnalyses.mockResolvedValue({});
        mockTeamService.getAllTeams.mockResolvedValue([]);
        mockGetUserTeamIds.mockReturnValue([]);
        mockAnalysisService.getConfig.mockResolvedValue({});

        const result = await service.refreshInitDataForUser('user-123');

        expect(result).toBe(2);
      });
    });

    describe('Error handling', () => {
      it('should continue refreshing remaining sessions if one fails', async () => {
        const mockSession1 = createMockClient('user-123');
        const mockSession2 = createMockClient('user-123');

        mockSession1.push.mockRejectedValue(new Error('Push failed'));

        mockSSEManager.sessionManager.getSessionsByUserId.mockReturnValue([
          mockSession1,
          mockSession2,
        ]);

        mockExecuteQuery.mockReturnValue({
          id: 'user-123',
          role: 'user',
          email: 'user@example.com',
          name: 'Test User',
        });

        mockAnalysisService.getAllAnalyses.mockResolvedValue({});
        mockTeamService.getAllTeams.mockResolvedValue([]);
        mockGetUserTeamIds.mockReturnValue([]);
        mockAnalysisService.getConfig.mockResolvedValue({});

        const result = await service.refreshInitDataForUser('user-123');

        // Both sessions get counted because sendInitialData catches errors internally
        // and refreshInitDataForUser increments count before any error could propagate
        expect(result).toBe(2);
        expect(mockSession2.push).toHaveBeenCalled();
      });

      it('should handle service errors during refresh', async () => {
        const mockSession = createMockClient('user-123');

        mockSSEManager.sessionManager.getSessionsByUserId.mockReturnValue([
          mockSession,
        ]);

        mockExecuteQuery.mockReturnValue({
          id: 'user-123',
          role: 'user',
          email: 'user@example.com',
          name: 'Test User',
        });

        mockAnalysisService.getAllAnalyses.mockRejectedValue(
          new Error('Service error'),
        );

        const result = await service.refreshInitDataForUser('user-123');

        // Session still gets counted because sendInitialData catches errors internally
        // before they can propagate to refreshInitDataForUser
        expect(result).toBe(1);
        expect(sharedMockLogger.error).toHaveBeenCalled();
      });

      it('should log error when session refresh fails', async () => {
        const mockSession = createMockClient('user-123');

        mockSession.push.mockRejectedValue(new Error('Push failed'));

        mockSSEManager.sessionManager.getSessionsByUserId.mockReturnValue([
          mockSession,
        ]);

        mockExecuteQuery.mockReturnValue({
          id: 'user-123',
          role: 'user',
          email: 'user@example.com',
          name: 'Test User',
        });

        mockAnalysisService.getAllAnalyses.mockResolvedValue({});
        mockTeamService.getAllTeams.mockResolvedValue([]);
        mockGetUserTeamIds.mockReturnValue([]);
        mockAnalysisService.getConfig.mockResolvedValue({});

        await service.refreshInitDataForUser('user-123');

        // Error is caught inside sendInitialData, not refreshInitDataForUser
        expect(sharedMockLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.any(Error),
          }),
          expect.stringContaining('Error sending initial SSE data'),
        );
      });
    });
  });

  // ========================================================================
  // sendStatusUpdate Tests
  // ========================================================================

  describe('sendStatusUpdate', () => {
    let service: any;

    beforeEach(() => {
      service = new InitDataService(mockSSEManager as any);
    });

    describe('Happy path - Container states', () => {
      it('should send healthy status when container is ready', async () => {
        const client = createMockClient();

        mockSSEManager.getContainerState.mockReturnValue({
          status: 'ready',
          startTime: new Date(),
          message: 'Container is ready',
        });

        await service.sendStatusUpdate(client);

        expect(client.push).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'statusUpdate',
            container_health: expect.objectContaining({
              status: 'healthy',
              message: 'Container is ready',
            }),
          }),
        );
      });

      it('should send initializing status when container is not ready', async () => {
        const client = createMockClient();

        mockSSEManager.getContainerState.mockReturnValue({
          status: 'initializing',
          startTime: new Date(),
          message: 'Initializing...',
        });

        await service.sendStatusUpdate(client);

        expect(client.push).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'statusUpdate',
            container_health: expect.objectContaining({
              status: 'initializing',
            }),
          }),
        );
      });

      it('should include uptime in seconds and formatted', async () => {
        const client = createMockClient();

        const startTime = new Date(Date.now() - 125000);
        mockSSEManager.getContainerState.mockReturnValue({
          status: 'ready',
          startTime,
          message: 'Ready',
        });

        await service.sendStatusUpdate(client);

        const pushCall = client.push.mock.calls[0][0] as {
          container_health: { uptime: { seconds: number; formatted: string } };
        };
        expect(pushCall.container_health.uptime).toEqual({
          seconds: expect.any(Number),
          formatted: expect.any(String),
        });
        expect(pushCall.container_health.uptime.seconds).toBeGreaterThanOrEqual(
          125,
        );
      });
    });

    describe('Happy path - Running analyses', () => {
      it('should report 0 running analyses when none are running', async () => {
        const client = createMockClient();

        mockSSEManager.getContainerState.mockReturnValue({
          status: 'ready',
          startTime: new Date(),
          message: 'Ready',
        });

        // Mock analysisService.analyses as empty map
        mockAnalysisService.analyses = new Map();

        await service.sendStatusUpdate(client);

        expect(client.push).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'statusUpdate',
            tagoConnection: expect.objectContaining({
              runningAnalyses: 0,
            }),
          }),
        );
      });

      it('should count running analyses correctly', async () => {
        const client = createMockClient();

        mockSSEManager.getContainerState.mockReturnValue({
          status: 'ready',
          startTime: new Date(),
          message: 'Ready',
        });

        const mockAnalysisMap = new Map([
          ['analysis-1', { status: 'running' }],
          ['analysis-2', { status: 'running' }],
          ['analysis-3', { status: 'stopped' }],
        ]);

        mockAnalysisService.analyses = mockAnalysisMap;

        await service.sendStatusUpdate(client);

        expect(client.push).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'statusUpdate',
            tagoConnection: expect.objectContaining({
              runningAnalyses: 2,
            }),
          }),
        );
      });

      it('should include SDK version in status', async () => {
        const client = createMockClient();

        mockSSEManager.getContainerState.mockReturnValue({
          status: 'ready',
          startTime: new Date(),
          message: 'Ready',
        });

        const { getPackageVersion } =
          await import('../../../src/utils/packageVersion.ts');
        (getPackageVersion as unknown as MockInstance).mockReturnValue('1.2.3');

        await service.sendStatusUpdate(client);

        expect(client.push).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'statusUpdate',
            tagoConnection: expect.objectContaining({
              sdkVersion: '1.2.3',
            }),
          }),
        );
      });
    });

    describe('Error handling', () => {
      it('should handle missing analyses property gracefully', async () => {
        const client = createMockClient();

        mockSSEManager.getContainerState.mockReturnValue({
          status: 'ready',
          startTime: new Date(),
          message: 'Ready',
        });

        mockAnalysisService.analyses = undefined;

        await service.sendStatusUpdate(client);

        expect(client.push).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'statusUpdate',
            tagoConnection: expect.objectContaining({
              runningAnalyses: 0,
            }),
          }),
        );
      });

      it('should handle analysis filtering errors gracefully', async () => {
        const client = createMockClient();

        mockSSEManager.getContainerState.mockReturnValue({
          status: 'ready',
          startTime: new Date(),
          message: 'Ready',
        });

        const mockAnalysisMap = new Map<string, { status: string } | null>([
          ['analysis-1', { status: 'running' }],
          ['analysis-2', null],
          ['analysis-3', { status: 'stopped' }],
        ]);

        mockAnalysisService.analyses = mockAnalysisMap as any;

        await service.sendStatusUpdate(client);

        expect(client.push).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'statusUpdate',
            tagoConnection: expect.objectContaining({
              runningAnalyses: 1,
            }),
          }),
        );
      });

      it('should handle client.push errors gracefully', async () => {
        const client = createMockClient();
        client.push.mockRejectedValue(new Error('Push failed'));

        mockSSEManager.getContainerState.mockReturnValue({
          status: 'ready',
          startTime: new Date(),
          message: 'Ready',
        });

        await service.sendStatusUpdate(client);

        expect(sharedMockLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({ error: expect.any(Error) }),
          expect.stringContaining('Error sending SSE status update'),
        );
      });
    });

    describe('Server time and formatting', () => {
      it('should include current server time in status', async () => {
        const client = createMockClient();

        mockSSEManager.getContainerState.mockReturnValue({
          status: 'ready',
          startTime: new Date(),
          message: 'Ready',
        });

        await service.sendStatusUpdate(client);

        expect(client.push).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'statusUpdate',
            serverTime: expect.any(String),
          }),
        );
      });
    });

    describe('Container state variations', () => {
      it('should handle error status', async () => {
        const client = createMockClient();

        mockSSEManager.getContainerState.mockReturnValue({
          status: 'error',
          startTime: new Date(),
          message: 'System error',
        });

        await service.sendStatusUpdate(client);

        expect(client.push).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'statusUpdate',
            container_health: expect.objectContaining({
              status: 'initializing',
              message: 'System error',
            }),
          }),
        );
      });

      it('should handle unknown status', async () => {
        const client = createMockClient();

        mockSSEManager.getContainerState.mockReturnValue({
          status: 'unknown',
          startTime: new Date(),
          message: 'Unknown status',
        });

        await service.sendStatusUpdate(client);

        expect(client.push).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'statusUpdate',
            container_health: expect.objectContaining({
              status: 'initializing',
            }),
          }),
        );
      });
    });
  });

  // ========================================================================
  // Integration and Edge Cases
  // ========================================================================

  describe('Integration scenarios', () => {
    let service: any;

    beforeEach(() => {
      service = new InitDataService(mockSSEManager as any);
    });

    it('should handle complete flow: sendInitialData then sendStatusUpdate', async () => {
      const client = createMockClient();

      mockExecuteQuery.mockReturnValue({
        id: 'test-user-123',
        role: 'admin',
        email: 'test@example.com',
        name: 'Test User',
      });

      mockAnalysisService.getAllAnalyses.mockResolvedValue({
        'test-analysis': {
          id: 'test-analysis',
          name: 'Test',
          enabled: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      mockTeamService.getAllTeams.mockResolvedValue([]);
      mockAnalysisService.getConfig.mockResolvedValue({});

      mockSSEManager.getContainerState.mockReturnValue({
        status: 'ready',
        startTime: new Date(),
        message: 'Ready',
      });

      mockAnalysisService.analyses = new Map([
        ['test-analysis', { status: 'running' }],
      ]);

      await service.sendInitialData(client);

      expect(client.push).toHaveBeenCalledTimes(2);

      const [initCall, statusCall] = client.push.mock.calls as [
        [{ type: string }],
        [{ type: string }],
      ];
      expect(initCall[0].type).toBe('init');
      expect(statusCall[0].type).toBe('statusUpdate');
    });
  });
});
