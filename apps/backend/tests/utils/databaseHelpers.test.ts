/**
 * Tests for Database Helper Utilities
 * Comprehensive test suite for SQLite data type conversions
 */

import { describe, it, expect } from 'vitest';
import {
  convertSQLiteBooleans,
  convertSQLiteBooleansArray,
  convertSnakeCaseToCamelCase,
  convertSnakeCaseToCamelCaseArray,
} from '../../src/utils/databaseHelpers.ts';

interface TestInput {
  [key: string]: unknown;
}

describe('convertSQLiteBooleans', () => {
  describe('Basic functionality', () => {
    it('should convert single boolean field from 1 to true', () => {
      const input: TestInput = { is_system: 1, name: 'Test' };
      const result = convertSQLiteBooleans(input, ['isSystem']);

      expect(result.isSystem).toBe(true);
      expect(result.name).toBe('Test');
      expect(result.is_system).toBeUndefined();
    });

    it('should convert single boolean field from 0 to false', () => {
      const input: TestInput = { is_system: 0, name: 'Test' };
      const result = convertSQLiteBooleans(input, ['isSystem']);

      expect(result.isSystem).toBe(false);
      expect(result.name).toBe('Test');
      expect(result.is_system).toBeUndefined();
    });

    it('should convert multiple boolean fields', () => {
      const input: TestInput = {
        is_system: 1,
        is_active: 0,
        is_verified: 1,
        name: 'Test',
      };
      const result = convertSQLiteBooleans(input, [
        'isSystem',
        'isActive',
        'isVerified',
      ]);

      expect(result.isSystem).toBe(true);
      expect(result.isActive).toBe(false);
      expect(result.isVerified).toBe(true);
      expect(result.name).toBe('Test');
      expect(result.is_system).toBeUndefined();
      expect(result.is_active).toBeUndefined();
      expect(result.is_verified).toBeUndefined();
    });
  });

  describe('CamelCase to snake_case conversion', () => {
    it('should convert camelCase field names to snake_case for lookup', () => {
      const input: TestInput = { is_enabled: 1, user_name: 'John' };
      const result = convertSQLiteBooleans(input, ['isEnabled']);

      expect(result.isEnabled).toBe(true);
      expect(result.is_enabled).toBeUndefined();
      expect(result.user_name).toBe('John');
    });

    it('should handle multi-word camelCase correctly', () => {
      const input: TestInput = { is_super_admin: 1, is_email_verified: 0 };
      const result = convertSQLiteBooleans(input, [
        'isSuperAdmin',
        'isEmailVerified',
      ]);

      expect(result.isSuperAdmin).toBe(true);
      expect(result.isEmailVerified).toBe(false);
      expect(result.is_super_admin).toBeUndefined();
      expect(result.is_email_verified).toBeUndefined();
    });
  });

  describe('Field deletion options', () => {
    it('should keep original fields when keepOriginal is true', () => {
      const input: TestInput = { is_system: 1, name: 'Test' };
      const result = convertSQLiteBooleans(input, ['isSystem'], {
        keepOriginal: true,
      });

      expect(result.isSystem).toBe(true);
      expect(result.is_system).toBe(1);
      expect(result.name).toBe('Test');
    });

    it('should delete original fields by default', () => {
      const input: TestInput = { is_system: 1, name: 'Test' };
      const result = convertSQLiteBooleans(input, ['isSystem']);

      expect(result.isSystem).toBe(true);
      expect(result.is_system).toBeUndefined();
      expect(result.name).toBe('Test');
    });
  });

  describe('Edge cases', () => {
    it('should handle undefined field in input', () => {
      const input: TestInput = { name: 'Test' };
      const result = convertSQLiteBooleans(input, ['isSystem']);

      expect(result.isSystem).toBeUndefined();
      expect(result.is_system).toBeUndefined();
      expect(result.name).toBe('Test');
    });

    it('should handle null values', () => {
      const input: TestInput = { is_system: null, name: 'Test' };
      const result = convertSQLiteBooleans(input, ['isSystem']);

      expect(result.isSystem).toBe(false);
      expect(result.is_system).toBeUndefined();
      expect(result.name).toBe('Test');
    });

    it('should handle empty field array', () => {
      const input: TestInput = { is_system: 1, name: 'Test' };
      const result = convertSQLiteBooleans(input, []);

      expect(result.is_system).toBe(1);
      expect(result.name).toBe('Test');
    });

    it('should handle empty object', () => {
      const input: TestInput = {};
      const result = convertSQLiteBooleans(input, ['isSystem']);

      expect(result).toEqual({});
    });

    it('should not mutate original object', () => {
      const input: TestInput = { is_system: 1, name: 'Test' };
      const inputCopy = { ...input };
      const result = convertSQLiteBooleans(input, ['isSystem']);

      expect(input).toEqual(inputCopy);
      expect(result).not.toBe(input);
    });

    it('should handle non-numeric values gracefully', () => {
      const input: TestInput = { is_system: 'yes', name: 'Test' };
      const result = convertSQLiteBooleans(input, ['isSystem']);

      // Non-0/1 values should be treated as truthy/falsy
      expect(result.isSystem).toBe(true);
      expect(result.is_system).toBeUndefined();
    });

    it('should handle boolean values already present', () => {
      const input: TestInput = { is_system: true, name: 'Test' };
      const result = convertSQLiteBooleans(input, ['isSystem']);

      expect(result.isSystem).toBe(true);
      expect(result.is_system).toBeUndefined();
    });
  });

  describe('Special characters and edge naming', () => {
    it('should handle single letter uppercase in camelCase', () => {
      const input: TestInput = { is_a: 1 };
      const result = convertSQLiteBooleans(input, ['isA']);

      expect(result.isA).toBe(true);
      expect(result.is_a).toBeUndefined();
    });

    it('should handle consecutive uppercase letters', () => {
      const input: TestInput = { is_html_enabled: 1 };
      const result = convertSQLiteBooleans(input, ['isHTMLEnabled']);

      expect(result.isHTMLEnabled).toBe(true);
      expect(result.is_html_enabled).toBeUndefined();
    });
  });
});

describe('convertSQLiteBooleansArray', () => {
  it('should convert array of objects', () => {
    const input: TestInput[] = [
      { id: 1, is_system: 1, name: 'Team 1' },
      { id: 2, is_system: 0, name: 'Team 2' },
      { id: 3, is_system: 1, name: 'Team 3' },
    ];

    const result = convertSQLiteBooleansArray(input, ['isSystem']);

    expect(result).toHaveLength(3);
    expect(result[0].isSystem).toBe(true);
    expect(result[0].is_system).toBeUndefined();
    expect(result[1].isSystem).toBe(false);
    expect(result[1].is_system).toBeUndefined();
    expect(result[2].isSystem).toBe(true);
    expect(result[2].is_system).toBeUndefined();
  });

  it('should handle empty array', () => {
    const input: TestInput[] = [];
    const result = convertSQLiteBooleansArray(input, ['isSystem']);

    expect(result).toEqual([]);
  });

  it('should convert multiple fields in array of objects', () => {
    const input: TestInput[] = [
      { id: 1, is_system: 1, is_active: 0 },
      { id: 2, is_system: 0, is_active: 1 },
    ];

    const result = convertSQLiteBooleansArray(input, ['isSystem', 'isActive']);

    expect(result[0].isSystem).toBe(true);
    expect(result[0].isActive).toBe(false);
    expect(result[1].isSystem).toBe(false);
    expect(result[1].isActive).toBe(true);
  });

  it('should pass options through to individual conversions', () => {
    const input: TestInput[] = [
      { id: 1, is_system: 1 },
      { id: 2, is_system: 0 },
    ];

    const result = convertSQLiteBooleansArray(input, ['isSystem'], {
      keepOriginal: true,
    });

    expect(result[0].isSystem).toBe(true);
    expect(result[0].is_system).toBe(1);
    expect(result[1].isSystem).toBe(false);
    expect(result[1].is_system).toBe(0);
  });
});

describe('Integration scenarios', () => {
  it('should handle typical team service response', () => {
    const teams: TestInput[] = [
      {
        id: 'team-1',
        name: 'Engineering',
        organizationId: 'org-1',
        createdAt: '2024-01-01T00:00:00Z',
        color: '#FF5733',
        order_index: 0,
        is_system: 1,
      },
      {
        id: 'team-2',
        name: 'Marketing',
        organizationId: 'org-1',
        createdAt: '2024-01-02T00:00:00Z',
        color: '#3498DB',
        order_index: 1,
        is_system: 0,
      },
    ];

    const result = convertSQLiteBooleansArray(teams, ['isSystem']);

    expect(result[0]).toEqual({
      id: 'team-1',
      name: 'Engineering',
      organizationId: 'org-1',
      createdAt: '2024-01-01T00:00:00Z',
      color: '#FF5733',
      order_index: 0,
      isSystem: true,
    });

    expect(result[1]).toEqual({
      id: 'team-2',
      name: 'Marketing',
      organizationId: 'org-1',
      createdAt: '2024-01-02T00:00:00Z',
      color: '#3498DB',
      order_index: 1,
      isSystem: false,
    });
  });

  it('should handle single team query result', () => {
    const team: TestInput = {
      id: 'team-1',
      name: 'Engineering',
      organizationId: 'org-1',
      createdAt: '2024-01-01T00:00:00Z',
      color: '#FF5733',
      order_index: 0,
      is_system: 1,
    };

    const result = convertSQLiteBooleans(team, ['isSystem']);

    expect(result.isSystem).toBe(true);
    expect(result.is_system).toBeUndefined();
    expect(result.id).toBe('team-1');
    expect(result.name).toBe('Engineering');
  });

  it('should preserve all non-boolean fields', () => {
    const input: TestInput = {
      id: 'test-id',
      name: 'Test Name',
      count: 42,
      rate: 3.14,
      metadata: { key: 'value' },
      tags: ['tag1', 'tag2'],
      is_system: 1,
    };

    const result = convertSQLiteBooleans(input, ['isSystem']);

    expect(result.id).toBe('test-id');
    expect(result.name).toBe('Test Name');
    expect(result.count).toBe(42);
    expect(result.rate).toBe(3.14);
    expect(result.metadata).toEqual({ key: 'value' });
    expect(result.tags).toEqual(['tag1', 'tag2']);
    expect(result.isSystem).toBe(true);
    expect(result.is_system).toBeUndefined();
  });
});

describe('convertSnakeCaseToCamelCase', () => {
  describe('Basic functionality', () => {
    it('should convert single snake_case field to camelCase', () => {
      const input: TestInput = { order_index: 0, name: 'Test' };
      const result = convertSnakeCaseToCamelCase(input, ['orderIndex']);

      expect(result.orderIndex).toBe(0);
      expect(result.name).toBe('Test');
      expect(result.order_index).toBeUndefined();
    });

    it('should convert multiple snake_case fields', () => {
      const input: TestInput = {
        order_index: 1,
        first_name: 'John',
        last_name: 'Doe',
        name: 'Test',
      };
      const result = convertSnakeCaseToCamelCase(input, [
        'orderIndex',
        'firstName',
        'lastName',
      ]);

      expect(result.orderIndex).toBe(1);
      expect(result.firstName).toBe('John');
      expect(result.lastName).toBe('Doe');
      expect(result.name).toBe('Test');
      expect(result.order_index).toBeUndefined();
      expect(result.first_name).toBeUndefined();
      expect(result.last_name).toBeUndefined();
    });
  });

  describe('Field deletion options', () => {
    it('should keep original fields when keepOriginal is true', () => {
      const input: TestInput = { order_index: 0, name: 'Test' };
      const result = convertSnakeCaseToCamelCase(input, ['orderIndex'], {
        keepOriginal: true,
      });

      expect(result.orderIndex).toBe(0);
      expect(result.order_index).toBe(0);
      expect(result.name).toBe('Test');
    });

    it('should delete original fields by default', () => {
      const input: TestInput = { order_index: 0, name: 'Test' };
      const result = convertSnakeCaseToCamelCase(input, ['orderIndex']);

      expect(result.orderIndex).toBe(0);
      expect(result.order_index).toBeUndefined();
      expect(result.name).toBe('Test');
    });
  });

  describe('Edge cases', () => {
    it('should handle undefined field in input', () => {
      const input: TestInput = { name: 'Test' };
      const result = convertSnakeCaseToCamelCase(input, ['orderIndex']);

      expect(result.orderIndex).toBeUndefined();
      expect(result.order_index).toBeUndefined();
      expect(result.name).toBe('Test');
    });

    it('should handle empty field array', () => {
      const input: TestInput = { order_index: 0, name: 'Test' };
      const result = convertSnakeCaseToCamelCase(input, []);

      expect(result.order_index).toBe(0);
      expect(result.name).toBe('Test');
    });

    it('should handle empty object', () => {
      const input: TestInput = {};
      const result = convertSnakeCaseToCamelCase(input, ['orderIndex']);

      expect(result).toEqual({});
    });

    it('should not mutate original object', () => {
      const input: TestInput = { order_index: 0, name: 'Test' };
      const inputCopy = { ...input };
      const result = convertSnakeCaseToCamelCase(input, ['orderIndex']);

      expect(input).toEqual(inputCopy);
      expect(result).not.toBe(input);
    });
  });
});

describe('convertSnakeCaseToCamelCaseArray', () => {
  it('should convert array of objects', () => {
    const input: TestInput[] = [
      { id: 1, order_index: 0, name: 'Team 1' },
      { id: 2, order_index: 1, name: 'Team 2' },
      { id: 3, order_index: 2, name: 'Team 3' },
    ];

    const result = convertSnakeCaseToCamelCaseArray(input, ['orderIndex']);

    expect(result).toHaveLength(3);
    expect(result[0].orderIndex).toBe(0);
    expect(result[0].order_index).toBeUndefined();
    expect(result[1].orderIndex).toBe(1);
    expect(result[1].order_index).toBeUndefined();
    expect(result[2].orderIndex).toBe(2);
    expect(result[2].order_index).toBeUndefined();
  });

  it('should handle empty array', () => {
    const input: TestInput[] = [];
    const result = convertSnakeCaseToCamelCaseArray(input, ['orderIndex']);

    expect(result).toEqual([]);
  });

  it('should convert multiple fields in array of objects', () => {
    const input: TestInput[] = [
      { id: 1, order_index: 0, first_name: 'John' },
      { id: 2, order_index: 1, first_name: 'Jane' },
    ];

    const result = convertSnakeCaseToCamelCaseArray(input, [
      'orderIndex',
      'firstName',
    ]);

    expect(result[0].orderIndex).toBe(0);
    expect(result[0].firstName).toBe('John');
    expect(result[1].orderIndex).toBe(1);
    expect(result[1].firstName).toBe('Jane');
  });

  it('should pass options through to individual conversions', () => {
    const input: TestInput[] = [
      { id: 1, order_index: 0 },
      { id: 2, order_index: 1 },
    ];

    const result = convertSnakeCaseToCamelCaseArray(input, ['orderIndex'], {
      keepOriginal: true,
    });

    expect(result[0].orderIndex).toBe(0);
    expect(result[0].order_index).toBe(0);
    expect(result[1].orderIndex).toBe(1);
    expect(result[1].order_index).toBe(1);
  });
});

describe('Combined conversions', () => {
  it('should apply boolean and camelCase conversions together', () => {
    const input: TestInput = {
      id: 'team-1',
      name: 'Engineering',
      color: '#FF5733',
      order_index: 0,
      is_system: 1,
    };

    let result = convertSQLiteBooleans(input, ['isSystem']);
    result = convertSnakeCaseToCamelCase(result, ['orderIndex']);

    expect(result.orderIndex).toBe(0);
    expect(result.isSystem).toBe(true);
    expect(result.order_index).toBeUndefined();
    expect(result.is_system).toBeUndefined();
    expect(result.name).toBe('Engineering');
  });

  it('should apply conversions to array of teams', () => {
    const teams: TestInput[] = [
      {
        id: 'team-1',
        name: 'Engineering',
        order_index: 0,
        is_system: 1,
      },
      {
        id: 'team-2',
        name: 'Marketing',
        order_index: 1,
        is_system: 0,
      },
    ];

    let result = convertSQLiteBooleansArray(teams, ['isSystem']);
    result = convertSnakeCaseToCamelCaseArray(result, ['orderIndex']);

    expect(result[0].orderIndex).toBe(0);
    expect(result[0].isSystem).toBe(true);
    expect(result[1].orderIndex).toBe(1);
    expect(result[1].isSystem).toBe(false);
    expect(result[0].order_index).toBeUndefined();
    expect(result[0].is_system).toBeUndefined();
  });
});
