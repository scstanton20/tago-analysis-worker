/**
 * ServerTime Utility Tests
 *
 * Tests the centralized server time formatting utility.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  getServerTime,
  getServerTimeISO,
  formatServerTime,
  getTimestamp,
  formatCompactTime,
  getCompactServerTime,
} from '../../src/utils/serverTime.ts';

describe('serverTime', () => {
  describe('getServerTime', () => {
    it('should return a string', () => {
      const result = getServerTime();
      expect(typeof result).toBe('string');
    });

    it('should return non-empty string', () => {
      const result = getServerTime();
      expect(result.length).toBeGreaterThan(0);
    });

    it('should return Date.toString() format', () => {
      const result = getServerTime();
      // Date.toString() format includes day of week, month, date, year, time, and timezone
      // Example: "Thu Jan 08 2026 23:05:31 GMT-0500 (Eastern Standard Time)"
      expect(result).toMatch(/^\w{3} \w{3} \d{2} \d{4}/);
    });

    it('should include timezone information', () => {
      const result = getServerTime();
      // Should contain GMT offset
      expect(result).toMatch(/GMT[+-]\d{4}/);
    });

    it('should return current time', () => {
      const before = new Date();
      const result = getServerTime();
      const after = new Date();

      const resultDate = new Date(result);
      expect(resultDate.getTime()).toBeGreaterThanOrEqual(
        before.getTime() - 1000,
      );
      expect(resultDate.getTime()).toBeLessThanOrEqual(after.getTime() + 1000);
    });
  });

  describe('getServerTimeISO', () => {
    it('should return ISO 8601 format', () => {
      const result = getServerTimeISO();
      // ISO format: "2026-01-09T04:05:31.123Z"
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should return UTC time (ends with Z)', () => {
      const result = getServerTimeISO();
      expect(result.endsWith('Z')).toBe(true);
    });

    it('should return current time', () => {
      const before = Date.now();
      const result = getServerTimeISO();
      const after = Date.now();

      const resultTime = new Date(result).getTime();
      expect(resultTime).toBeGreaterThanOrEqual(before - 1000);
      expect(resultTime).toBeLessThanOrEqual(after + 1000);
    });
  });

  describe('formatServerTime', () => {
    it('should format a Date object', () => {
      const date = new Date('2026-01-08T23:05:31.000Z');
      const result = formatServerTime(date);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should return Date.toString() format', () => {
      const date = new Date('2026-01-08T23:05:31.000Z');
      const result = formatServerTime(date);
      expect(result).toBe(date.toString());
    });

    it('should preserve the original date value', () => {
      const date = new Date('2026-06-15T12:30:00.000Z');
      const result = formatServerTime(date);
      expect(result).toContain('Jun');
      expect(result).toContain('15');
      expect(result).toContain('2026');
    });
  });

  describe('getTimestamp', () => {
    it('should return a number', () => {
      const result = getTimestamp();
      expect(typeof result).toBe('number');
    });

    it('should return positive integer', () => {
      const result = getTimestamp();
      expect(result).toBeGreaterThan(0);
      expect(Number.isInteger(result)).toBe(true);
    });

    it('should return current time in milliseconds', () => {
      const before = Date.now();
      const result = getTimestamp();
      const after = Date.now();

      expect(result).toBeGreaterThanOrEqual(before);
      expect(result).toBeLessThanOrEqual(after);
    });

    it('should be equivalent to Date.now()', () => {
      // Use fake timers to ensure exact match
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-08T23:05:31.123Z'));

      const result = getTimestamp();
      expect(result).toBe(Date.now());

      vi.useRealTimers();
    });
  });

  describe('consistency', () => {
    it('should have getServerTime match Date.toString()', () => {
      vi.useFakeTimers();
      const fixedDate = new Date('2026-01-08T23:05:31.000Z');
      vi.setSystemTime(fixedDate);

      const result = getServerTime();
      expect(result).toBe(fixedDate.toString());

      vi.useRealTimers();
    });

    it('should have getServerTimeISO match Date.toISOString()', () => {
      vi.useFakeTimers();
      const fixedDate = new Date('2026-01-08T23:05:31.123Z');
      vi.setSystemTime(fixedDate);

      const result = getServerTimeISO();
      expect(result).toBe(fixedDate.toISOString());

      vi.useRealTimers();
    });
  });

  describe('formatCompactTime', () => {
    it('should format timestamp number as HH:MM:SS', () => {
      // Use a specific timestamp
      const timestamp = new Date('2026-01-08T23:05:31.000Z').getTime();
      const result = formatCompactTime(timestamp);
      // Result depends on local timezone, but should match HH:MM:SS format
      expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    });

    it('should format Date object as HH:MM:SS', () => {
      const date = new Date('2026-01-08T23:05:31.000Z');
      const result = formatCompactTime(date);
      expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    });

    it('should use 24-hour format', () => {
      // Create a time that would be PM in 12-hour format
      const date = new Date('2026-01-08T15:30:45.000Z');
      const result = formatCompactTime(date);
      // Should not contain AM/PM
      expect(result).not.toMatch(/[AP]M/i);
      expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    });

    it('should pad single digits with zeros', () => {
      const date = new Date('2026-01-08T05:03:07.000Z');
      const result = formatCompactTime(date);
      // All components should be 2 digits
      const parts = result.split(':');
      expect(parts).toHaveLength(3);
      parts.forEach((part) => {
        expect(part).toHaveLength(2);
      });
    });

    it('should handle midnight correctly', () => {
      const date = new Date('2026-01-08T00:00:00.000Z');
      const result = formatCompactTime(date);
      // In local timezone, but format should be valid
      expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    });

    it('should return same result for equivalent timestamp and Date', () => {
      const date = new Date('2026-01-08T12:30:45.000Z');
      const timestamp = date.getTime();

      const resultFromDate = formatCompactTime(date);
      const resultFromTimestamp = formatCompactTime(timestamp);

      expect(resultFromDate).toBe(resultFromTimestamp);
    });

    it('should handle ISO string timestamp', () => {
      const isoString = '2026-01-08T12:30:45.000Z';
      const result = formatCompactTime(isoString);
      expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    });

    it('should handle Date.toString() format string', () => {
      const date = new Date('2026-01-08T12:30:45.000Z');
      const dateString = date.toString();
      const result = formatCompactTime(dateString);
      expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    });

    it('should return same result for equivalent string and Date', () => {
      const date = new Date('2026-01-08T12:30:45.000Z');
      const isoString = date.toISOString();

      const resultFromDate = formatCompactTime(date);
      const resultFromString = formatCompactTime(isoString);

      expect(resultFromDate).toBe(resultFromString);
    });

    it('should handle invalid string gracefully', () => {
      const result = formatCompactTime('not-a-date');
      // Should return current time format when string is invalid
      expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    });
  });

  describe('getCompactServerTime', () => {
    it('should return HH:MM:SS format', () => {
      const result = getCompactServerTime();
      expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    });

    it('should return current time', () => {
      vi.useFakeTimers();
      const fixedDate = new Date('2026-01-08T14:25:36.000Z');
      vi.setSystemTime(fixedDate);

      const result = getCompactServerTime();
      const expected = formatCompactTime(fixedDate);
      expect(result).toBe(expected);

      vi.useRealTimers();
    });

    it('should be equivalent to formatCompactTime(new Date())', () => {
      vi.useFakeTimers();
      const fixedDate = new Date('2026-01-08T09:15:22.000Z');
      vi.setSystemTime(fixedDate);

      const result = getCompactServerTime();
      const expected = formatCompactTime(new Date());
      expect(result).toBe(expected);

      vi.useRealTimers();
    });
  });
});
