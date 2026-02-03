/**
 * AnalysisConfigService Tests
 *
 * Tests configuration serialization, specifically that contradictory
 * states are normalized before being persisted to disk.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture what saveConfig writes
let writtenContent = '';
vi.mock('../../src/utils/safePath.ts', () => ({
  safeWriteFile: vi.fn(async (_path: string, content: string) => {
    writtenContent = content;
  }),
  safeReadFile: vi.fn(),
}));

vi.mock('../../src/utils/logging/logger.ts', () => ({
  createChildLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnValue({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  }),
}));

vi.mock('../../src/config/default.ts', () => ({
  config: {
    storage: { base: '/tmp/test' },
    paths: { config: '/tmp/test/config' },
    process: { additionalEnv: {} },
    sandbox: { enabled: false },
    logging: {},
  },
}));

vi.mock('../../src/migrations/analysisConfigMigrations.ts', () => ({
  runAnalysisConfigMigrations: vi.fn((c: unknown) => c),
  getCurrentConfigVersion: vi.fn().mockReturnValue('5.0'),
}));

vi.mock('../../src/services/sseManager.ts', () => ({
  getSseManager: vi.fn().mockResolvedValue({
    broadcastAnalysisUpdate: vi.fn(),
  }),
}));

vi.mock('../../src/services/dnsCache.ts', () => ({
  getDnsCache: vi.fn().mockResolvedValue({
    handleDNSLookupRequest: vi.fn(),
    handleDNSResolve4Request: vi.fn(),
    handleDNSResolve6Request: vi.fn(),
  }),
}));

vi.mock('../../src/utils/time.ts', () => ({
  getServerTime: vi.fn().mockReturnValue('2026-01-01T00:00:00.000Z'),
}));

describe('AnalysisConfigService.saveConfig', () => {
  beforeEach(() => {
    writtenContent = '';
  });

  it('should normalize intendedState to stopped when enabled is false', async () => {
    const { AnalysisConfigService } =
      await import('../../src/services/analysis/AnalysisConfigService.ts');

    const service = new AnalysisConfigService();

    // Create a mock analysis with the contradictory state
    const mockAnalysis = {
      analysisId: 'test-123',
      analysisName: 'Test Analysis',
      enabled: false,
      intendedState: 'running' as const,
      lastStartTime: null,
      teamId: 'team-1',
    };

    const map = new Map();
    map.set('test-123', mockAnalysis);
    service.setAnalysesMap(map);

    await service.saveConfig();

    const saved = JSON.parse(writtenContent);
    expect(saved.analyses['test-123'].intendedState).toBe('stopped');
    expect(saved.analyses['test-123'].enabled).toBe(false);
  });

  it('should preserve intendedState running when enabled is true', async () => {
    const { AnalysisConfigService } =
      await import('../../src/services/analysis/AnalysisConfigService.ts');

    const service = new AnalysisConfigService();

    const mockAnalysis = {
      analysisId: 'test-456',
      analysisName: 'Running Analysis',
      enabled: true,
      intendedState: 'running' as const,
      lastStartTime: '2026-01-01T00:00:00.000Z',
      teamId: 'team-1',
    };

    const map = new Map();
    map.set('test-456', mockAnalysis);
    service.setAnalysesMap(map);

    await service.saveConfig();

    const saved = JSON.parse(writtenContent);
    expect(saved.analyses['test-456'].intendedState).toBe('running');
    expect(saved.analyses['test-456'].enabled).toBe(true);
  });
});
