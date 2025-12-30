import { describe, it, expect } from 'vitest';
import {
  generateSessionId,
  isValidAnalysisName,
  isValidTeamId,
  extractAnalysisId,
  formatContainerStatus,
  isIterable,
  HEARTBEAT_INTERVAL_MS,
  METRICS_INTERVAL_MS,
  STALE_CONNECTION_TIMEOUT,
  SSE_API_VERSION,
  SESSION_ID_SUBSTRING_START,
  SESSION_ID_SUBSTRING_END,
  FORCE_LOGOUT_MESSAGE_DELIVERY_DELAY_MS,
} from '../../../src/utils/sse/utils.ts';

describe('SSE Utils', () => {
  // ========================================================================
  // CONSTANTS TESTS
  // ========================================================================

  describe('Constants', () => {
    it('should export HEARTBEAT_INTERVAL_MS', () => {
      expect(HEARTBEAT_INTERVAL_MS).toBeDefined();
      expect(typeof HEARTBEAT_INTERVAL_MS).toBe('number');
      expect(HEARTBEAT_INTERVAL_MS).toBeGreaterThan(0);
    });

    it('should export METRICS_INTERVAL_MS', () => {
      expect(METRICS_INTERVAL_MS).toBeDefined();
      expect(typeof METRICS_INTERVAL_MS).toBe('number');
      expect(METRICS_INTERVAL_MS).toBeGreaterThan(0);
    });

    it('should export STALE_CONNECTION_TIMEOUT', () => {
      expect(STALE_CONNECTION_TIMEOUT).toBeDefined();
      expect(typeof STALE_CONNECTION_TIMEOUT).toBe('number');
      expect(STALE_CONNECTION_TIMEOUT).toBeGreaterThan(0);
    });

    it('should export SSE_API_VERSION', () => {
      expect(SSE_API_VERSION).toBeDefined();
      expect(typeof SSE_API_VERSION).toBe('string');
      expect(SSE_API_VERSION).toBe('4.0');
    });

    it('should export SESSION_ID_SUBSTRING_START', () => {
      expect(SESSION_ID_SUBSTRING_START).toBeDefined();
      expect(typeof SESSION_ID_SUBSTRING_START).toBe('number');
      expect(SESSION_ID_SUBSTRING_START).toBe(2);
    });

    it('should export SESSION_ID_SUBSTRING_END', () => {
      expect(SESSION_ID_SUBSTRING_END).toBeDefined();
      expect(typeof SESSION_ID_SUBSTRING_END).toBe('number');
      expect(SESSION_ID_SUBSTRING_END).toBe(15);
    });

    it('should export FORCE_LOGOUT_MESSAGE_DELIVERY_DELAY_MS', () => {
      expect(FORCE_LOGOUT_MESSAGE_DELIVERY_DELAY_MS).toBeDefined();
      expect(typeof FORCE_LOGOUT_MESSAGE_DELIVERY_DELAY_MS).toBe('number');
      expect(FORCE_LOGOUT_MESSAGE_DELIVERY_DELAY_MS).toBeGreaterThan(0);
    });
  });

  // ========================================================================
  // generateSessionId TESTS
  // ========================================================================

  describe('generateSessionId', () => {
    it('should generate a string session ID', () => {
      const sessionId = generateSessionId();
      expect(typeof sessionId).toBe('string');
    });

    it('should generate session ID of expected length', () => {
      const sessionId = generateSessionId();
      // Each random().toString(36).substring(2, 15) produces a variable length string
      // depending on the random value (typically 9-13 characters)
      // Two concatenated = 18-26 characters
      expect(sessionId.length).toBeGreaterThanOrEqual(18);
      expect(sessionId.length).toBeLessThanOrEqual(26);
    });

    it('should generate unique session IDs', () => {
      const sessionId1 = generateSessionId();
      const sessionId2 = generateSessionId();
      expect(sessionId1).not.toBe(sessionId2);
    });

    it('should generate alphanumeric session IDs', () => {
      const sessionId = generateSessionId();
      // Session ID should be alphanumeric (base-36 output)
      expect(/^[a-z0-9]+$/.test(sessionId)).toBe(true);
    });

    it('should generate multiple unique session IDs in rapid succession', () => {
      const sessionIds = new Set();
      for (let i = 0; i < 100; i++) {
        sessionIds.add(generateSessionId());
      }
      // All 100 IDs should be unique
      expect(sessionIds.size).toBe(100);
    });
  });

  // ========================================================================
  // isValidAnalysisName TESTS
  // ========================================================================

  describe('isValidAnalysisName', () => {
    // Branch: typeof name === 'string' -> true
    // Branch: name.length > 0 -> true
    // Branch: name.trim() === name -> true
    it('should accept valid analysis names', () => {
      expect(isValidAnalysisName('my-analysis')).toBe(true);
      expect(isValidAnalysisName('MyAnalysis')).toBe(true);
      expect(isValidAnalysisName('analysis_123')).toBe(true);
      expect(isValidAnalysisName('A')).toBe(true);
      expect(isValidAnalysisName('Analysis Name')).toBe(true);
    });

    // Branch: typeof name === 'string' -> false
    it('should reject non-string values', () => {
      expect(isValidAnalysisName(123)).toBe(false);
      expect(isValidAnalysisName(null)).toBe(false);
      expect(isValidAnalysisName(undefined)).toBe(false);
      expect(isValidAnalysisName({})).toBe(false);
      expect(isValidAnalysisName([])).toBe(false);
      expect(isValidAnalysisName(true)).toBe(false);
      expect(isValidAnalysisName(() => {})).toBe(false);
    });

    // Branch: typeof name === 'string' -> true
    // Branch: name.length > 0 -> false
    it('should reject empty strings', () => {
      expect(isValidAnalysisName('')).toBe(false);
    });

    // Branch: typeof name === 'string' -> true
    // Branch: name.length > 0 -> true
    // Branch: name.trim() === name -> false (has leading whitespace)
    it('should reject strings with leading whitespace', () => {
      expect(isValidAnalysisName(' analysis')).toBe(false);
      expect(isValidAnalysisName('\tanalysis')).toBe(false);
      expect(isValidAnalysisName('\nanalysis')).toBe(false);
    });

    // Branch: typeof name === 'string' -> true
    // Branch: name.length > 0 -> true
    // Branch: name.trim() === name -> false (has trailing whitespace)
    it('should reject strings with trailing whitespace', () => {
      expect(isValidAnalysisName('analysis ')).toBe(false);
      expect(isValidAnalysisName('analysis\t')).toBe(false);
      expect(isValidAnalysisName('analysis\n')).toBe(false);
    });

    // Branch: typeof name === 'string' -> true
    // Branch: name.length > 0 -> true
    // Branch: name.trim() === name -> false (has both leading and trailing)
    it('should reject strings with both leading and trailing whitespace', () => {
      expect(isValidAnalysisName(' analysis ')).toBe(false);
      expect(isValidAnalysisName('\tanalysis\t')).toBe(false);
    });

    // Branch: typeof name === 'string' -> true
    // Branch: name.length > 0 -> true
    // Branch: name.trim() === name -> false (has internal but no leading/trailing should pass)
    it('should accept strings with internal spaces but no leading/trailing', () => {
      expect(isValidAnalysisName('my analysis')).toBe(true);
      expect(isValidAnalysisName('analysis with spaces')).toBe(true);
    });
  });

  // ========================================================================
  // isValidTeamId TESTS
  // ========================================================================

  describe('isValidTeamId', () => {
    // Branch: typeof teamId === 'string' -> true
    // Branch: teamId.length > 0 -> true
    it('should accept valid team IDs', () => {
      expect(isValidTeamId('team-123')).toBe(true);
      expect(isValidTeamId('TeamID')).toBe(true);
      expect(isValidTeamId('X')).toBe(true);
      expect(isValidTeamId('a')).toBe(true);
      expect(isValidTeamId('team id with spaces')).toBe(true);
    });

    // Branch: typeof teamId === 'string' -> false
    it('should reject non-string values', () => {
      expect(isValidTeamId(123)).toBe(false);
      expect(isValidTeamId(null)).toBe(false);
      expect(isValidTeamId(undefined)).toBe(false);
      expect(isValidTeamId({})).toBe(false);
      expect(isValidTeamId([])).toBe(false);
      expect(isValidTeamId(true)).toBe(false);
    });

    // Branch: typeof teamId === 'string' -> true
    // Branch: teamId.length > 0 -> false
    it('should reject empty strings', () => {
      expect(isValidTeamId('')).toBe(false);
    });

    // Note: Unlike isValidAnalysisName, teamId doesn't require trim check
    // So strings with whitespace should be valid
    it('should accept strings with whitespace (no trim validation for teamId)', () => {
      expect(isValidTeamId(' team ')).toBe(true);
      expect(isValidTeamId('\tteam\t')).toBe(true);
    });
  });

  // ========================================================================
  // extractAnalysisId TESTS
  // ========================================================================

  describe('extractAnalysisId', () => {
    // Branch: logData is null
    it('should return null for null logData', () => {
      expect(extractAnalysisId(null)).toBe(null);
    });

    // Branch: logData is undefined
    it('should return null for undefined logData', () => {
      expect(extractAnalysisId(undefined)).toBe(null);
    });

    // Branch: logData exists but no analysisId property
    it('should return null when logData has no analysisId', () => {
      expect(extractAnalysisId({})).toBe(null);
      expect(extractAnalysisId({ other: 'value' })).toBe(null);
    });

    // Branch: logData has analysisId with falsy value
    it('should return null for falsy analysisId values', () => {
      expect(extractAnalysisId({ analysisId: null as unknown as string })).toBe(
        null,
      );
      expect(extractAnalysisId({ analysisId: undefined })).toBe(null);
      expect(extractAnalysisId({ analysisId: '' })).toBe(null);
      expect(
        extractAnalysisId({ analysisId: false as unknown as string }),
      ).toBe(null);
      expect(extractAnalysisId({ analysisId: 0 as unknown as string })).toBe(
        null,
      );
    });

    // Branch: logData has analysisId with truthy value
    it('should return the analysisId when present and truthy', () => {
      expect(extractAnalysisId({ analysisId: 'analysis-123' })).toBe(
        'analysis-123',
      );
      expect(extractAnalysisId({ analysisId: 'test' })).toBe('test');
      expect(extractAnalysisId({ analysisId: '1' })).toBe('1');
    });

    // Branch: logData has other properties but valid analysisId
    it('should extract analysisId when mixed with other properties', () => {
      const logData = {
        analysisId: 'my-analysis',
        timestamp: '2024-01-01',
        message: 'test message',
        level: 'info',
      };
      expect(extractAnalysisId(logData)).toBe('my-analysis');
    });

    // Branch: analysisId is a number (truthy)
    it('should return numeric analysisId values', () => {
      expect(extractAnalysisId({ analysisId: 123 as unknown as string })).toBe(
        123,
      );
      expect(extractAnalysisId({ analysisId: 0 as unknown as string })).toBe(
        null,
      ); // 0 is falsy
    });

    // Branch: analysisId is a boolean true
    it('should return true when analysisId is boolean true', () => {
      expect(extractAnalysisId({ analysisId: true as unknown as string })).toBe(
        true,
      );
    });
  });

  // ========================================================================
  // formatContainerStatus TESTS
  // ========================================================================

  describe('formatContainerStatus', () => {
    // Branch: status matches 'ready'
    it('should format ready status to healthy', () => {
      expect(formatContainerStatus('ready')).toBe('healthy');
    });

    // Branch: status matches 'error'
    it('should format error status to error', () => {
      expect(formatContainerStatus('error')).toBe('error');
    });

    // Branch: status matches 'initializing'
    it('should format initializing status to initializing', () => {
      expect(formatContainerStatus('initializing')).toBe('initializing');
    });

    // Branch: status doesn't match any key -> returns default 'unknown'
    it('should return unknown for unrecognized status', () => {
      expect(formatContainerStatus('unknown')).toBe('unknown');
      expect(formatContainerStatus('pending')).toBe('unknown');
      expect(formatContainerStatus('stopped')).toBe('unknown');
      expect(formatContainerStatus('failed')).toBe('unknown');
      expect(formatContainerStatus('')).toBe('unknown');
    });

    // Branch: case sensitivity check
    it('should be case sensitive when matching status', () => {
      expect(formatContainerStatus('Ready')).toBe('unknown');
      expect(formatContainerStatus('ERROR')).toBe('unknown');
      expect(formatContainerStatus('INITIALIZING')).toBe('unknown');
    });

    // Branch: test all known mappings are correct
    it('should have correct mapping for all known statuses', () => {
      const mappings = {
        ready: 'healthy',
        error: 'error',
        initializing: 'initializing',
      };

      Object.entries(mappings).forEach(([status, expected]) => {
        expect(formatContainerStatus(status)).toBe(expected);
      });
    });
  });

  // ========================================================================
  // isIterable TESTS
  // ========================================================================

  describe('isIterable', () => {
    // Branch: value == null (checks for null)
    it('should return false for null', () => {
      expect(isIterable(null)).toBe(false);
    });

    // Branch: value == null (checks for undefined)
    it('should return false for undefined', () => {
      expect(isIterable(undefined)).toBe(false);
    });

    // Branch: value != null AND has Symbol.iterator that is a function
    it('should return true for arrays', () => {
      expect(isIterable([])).toBe(true);
      expect(isIterable([1, 2, 3])).toBe(true);
      expect(isIterable([])).toBe(true);
    });

    // Branch: value != null AND has Symbol.iterator that is a function
    it('should return true for strings', () => {
      expect(isIterable('hello')).toBe(true);
      expect(isIterable('')).toBe(true);
      expect(isIterable('a')).toBe(true);
    });

    // Branch: value != null AND has Symbol.iterator that is a function
    it('should return true for Sets', () => {
      expect(isIterable(new Set())).toBe(true);
      expect(isIterable(new Set([1, 2, 3]))).toBe(true);
    });

    // Branch: value != null AND has Symbol.iterator that is a function
    it('should return true for Maps', () => {
      expect(isIterable(new Map())).toBe(true);
      expect(
        isIterable(
          new Map([
            ['a', 1],
            ['b', 2],
          ]),
        ),
      ).toBe(true);
    });

    // Branch: value != null BUT no Symbol.iterator
    it('should return false for plain objects', () => {
      expect(isIterable({})).toBe(false);
      expect(isIterable({ a: 1, b: 2 })).toBe(false);
    });

    // Branch: value != null BUT no Symbol.iterator
    it('should return false for numbers', () => {
      expect(isIterable(123)).toBe(false);
      expect(isIterable(0)).toBe(false);
      expect(isIterable(-1)).toBe(false);
      expect(isIterable(Infinity)).toBe(false);
      expect(isIterable(NaN)).toBe(false);
    });

    // Branch: value != null BUT no Symbol.iterator
    it('should return false for booleans', () => {
      expect(isIterable(true)).toBe(false);
      expect(isIterable(false)).toBe(false);
    });

    // Branch: value != null AND has Symbol.iterator that is a function
    it('should return true for generator objects', () => {
      function* gen() {
        yield 1;
      }
      const generatorObj = gen();
      expect(isIterable(generatorObj)).toBe(true);
    });

    // Branch: value != null AND Symbol.iterator exists but is not a function
    it('should return false when Symbol.iterator is not a function', () => {
      const objWithNonFunctionIterator = {
        [Symbol.iterator]: 'not a function',
      };
      expect(isIterable(objWithNonFunctionIterator)).toBe(false);
    });

    // Branch: value != null AND Symbol.iterator is a number
    it('should return false when Symbol.iterator is a number', () => {
      const objWithNumberIterator = {
        [Symbol.iterator]: 42,
      };
      expect(isIterable(objWithNumberIterator)).toBe(false);
    });

    // Branch: value != null AND Symbol.iterator is null
    it('should return false when Symbol.iterator is null', () => {
      const objWithNullIterator = {
        [Symbol.iterator]: null,
      };
      expect(isIterable(objWithNullIterator)).toBe(false);
    });

    // Branch: value != null AND has valid Symbol.iterator function
    it('should return true for custom iterable objects', () => {
      const customIterable = {
        [Symbol.iterator]() {
          return {
            next() {
              return { done: true };
            },
          };
        },
      };
      expect(isIterable(customIterable)).toBe(true);
    });

    // Branch: edge case - WeakSet/WeakMap (not iterable)
    it('should return false for WeakSet', () => {
      expect(isIterable(new WeakSet())).toBe(false);
    });

    it('should return false for WeakMap', () => {
      expect(isIterable(new WeakMap())).toBe(false);
    });

    // Branch: value != null AND is a function (functions have Symbol.iterator check)
    it('should return false for functions', () => {
      expect(isIterable(() => {})).toBe(false);
      expect(isIterable(function () {})).toBe(false);
      expect(isIterable(class Foo {})).toBe(false);
    });

    // Branch: Type coercion edge cases
    it('should handle various falsy values', () => {
      // All these should pass the null/undefined check and fail the Symbol.iterator check
      expect(isIterable(0)).toBe(false);
      expect(isIterable('')).toBe(true); // Strings ARE iterable!
      expect(isIterable(false)).toBe(false);
    });
  });

  // ========================================================================
  // INTEGRATION/EDGE CASES
  // ========================================================================

  describe('Integration and edge cases', () => {
    it('should handle unicode in analysis names', () => {
      expect(isValidAnalysisName('análisis')).toBe(true);
      expect(isValidAnalysisName('分析')).toBe(true);
      expect(isValidAnalysisName('🔍 analysis')).toBe(true);
    });

    it('should validate analysis names with various special characters', () => {
      expect(isValidAnalysisName('analysis-test')).toBe(true);
      expect(isValidAnalysisName('analysis_test')).toBe(true);
      expect(isValidAnalysisName('analysis.test')).toBe(true);
      expect(isValidAnalysisName('analysis@test')).toBe(true);
      expect(isValidAnalysisName('analysis#test')).toBe(true);
    });

    it('should handle very long analysis names', () => {
      const longName = 'a'.repeat(1000);
      expect(isValidAnalysisName(longName)).toBe(true);
    });

    it('should handle very long team IDs', () => {
      const longId = 'a'.repeat(1000);
      expect(isValidTeamId(longId)).toBe(true);
    });

    it('should handle symbol-based custom iterables in isIterable', () => {
      const iterSymbol = Symbol.iterator;
      const customObj = {
        [iterSymbol]: () => ({
          next: () => ({ done: true }),
        }),
      };
      expect(isIterable(customObj)).toBe(true);
    });

    it('should extract analysis ID from complex nested objects', () => {
      const complexLog = {
        timestamp: new Date(),
        analysisId: 'complex-123',
        nested: { data: { value: 'test' } },
        metadata: { tags: ['important'] },
      };
      expect(extractAnalysisId(complexLog)).toBe('complex-123');
    });

    it('formatContainerStatus should be deterministic', () => {
      const status = 'ready';
      const result1 = formatContainerStatus(status);
      const result2 = formatContainerStatus(status);
      expect(result1).toBe(result2);
      expect(result1).toBe('healthy');
    });
  });
});
