/**
 * Database Helper Utilities
 * Provides conversion utilities for SQLite data types to JavaScript types
 *
 * SQLite stores booleans as integers (0 or 1), and these utilities help convert
 * them back to JavaScript boolean types when retrieving data from the database.
 *
 * @module databaseHelpers
 */

/**
 * Convert a camelCase field name to snake_case for database column lookup
 * @param {string} camelCase - Field name in camelCase format
 * @returns {string} Field name in snake_case format
 * @private
 *
 * @example
 * camelToSnake('isSystem') // returns 'is_system'
 * camelToSnake('isEmailVerified') // returns 'is_email_verified'
 * camelToSnake('isHTMLEnabled') // returns 'is_html_enabled'
 */
function camelToSnake(camelCase) {
  return (
    camelCase
      // Insert underscore before uppercase letter that follows lowercase
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      // Insert underscore before uppercase letter that's followed by lowercase
      .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
      .toLowerCase()
  );
}

/**
 * Convert snake_case field names to camelCase for API responses
 *
 * This function converts database snake_case field names to camelCase format
 * for consistent API responses. It automatically handles field renaming and
 * optionally removes the original snake_case fields.
 *
 * By default, the original snake_case fields are removed from the result.
 * Set options.keepOriginal to true to preserve them.
 *
 * @param {Object} obj - Object containing snake_case fields
 * @param {string[]} fieldNames - Array of camelCase field names to convert
 *   (e.g., ['orderIndex', 'isSystem'] will convert order_index and is_system)
 * @param {Object} [options] - Conversion options
 * @param {boolean} [options.keepOriginal=false] - Keep original snake_case fields
 * @returns {Object} New object with converted field names
 *
 * @example
 * // Basic usage
 * const team = { id: '1', name: 'Team', order_index: 0 };
 * const result = convertSnakeCaseToCamelCase(team, ['orderIndex']);
 * // Returns: { id: '1', name: 'Team', orderIndex: 0 }
 *
 * @example
 * // Multiple fields
 * const user = { id: '1', first_name: 'John', last_name: 'Doe' };
 * const result = convertSnakeCaseToCamelCase(user, ['firstName', 'lastName']);
 * // Returns: { id: '1', firstName: 'John', lastName: 'Doe' }
 */
export function convertSnakeCaseToCamelCase(
  obj,
  fieldNames,
  options = { keepOriginal: false },
) {
  // Create a shallow copy to avoid mutating the original object
  const result = { ...obj };

  for (const field of fieldNames) {
    // Convert camelCase to snake_case for database column lookup
    const dbField = camelToSnake(field);

    if (result[dbField] !== undefined) {
      // Copy the value using camelCase name
      result[field] = result[dbField];

      // Remove the snake_case version unless keepOriginal is true
      if (!options.keepOriginal) {
        delete result[dbField];
      }
    }
  }

  return result;
}

/**
 * Convert snake_case field names to camelCase for an array of objects
 *
 * This is a convenience function that applies convertSnakeCaseToCamelCase to each
 * object in an array. All options are passed through to the individual conversions.
 *
 * @param {Object[]} array - Array of objects containing snake_case fields
 * @param {string[]} fieldNames - Array of camelCase field names to convert
 * @param {Object} [options] - Conversion options (passed to convertSnakeCaseToCamelCase)
 * @param {boolean} [options.keepOriginal=false] - Keep original snake_case fields
 * @returns {Object[]} New array with converted field names
 *
 * @example
 * const teams = [
 *   { id: '1', name: 'Team A', order_index: 0 },
 *   { id: '2', name: 'Team B', order_index: 1 }
 * ];
 * const result = convertSnakeCaseToCamelCaseArray(teams, ['orderIndex']);
 * // Returns: [
 * //   { id: '1', name: 'Team A', orderIndex: 0 },
 * //   { id: '2', name: 'Team B', orderIndex: 1 }
 * // ]
 */
export function convertSnakeCaseToCamelCaseArray(array, fieldNames, options) {
  return array.map((obj) =>
    convertSnakeCaseToCamelCase(obj, fieldNames, options),
  );
}

/**
 * Convert SQLite boolean integers (0/1) to JavaScript booleans
 *
 * This function converts SQLite integer boolean values (0 or 1) to JavaScript
 * boolean types. It automatically maps camelCase field names to snake_case
 * database column names.
 *
 * By default, the original snake_case fields are removed from the result.
 * Set options.keepOriginal to true to preserve them.
 *
 * @param {Object} obj - Object containing SQLite data
 * @param {string[]} booleanFields - Array of camelCase field names to convert
 * @param {Object} [options] - Conversion options
 * @param {boolean} [options.keepOriginal=false] - Keep original snake_case fields
 * @returns {Object} New object with converted boolean fields
 *
 * @example
 * // Basic usage
 * const team = { id: '1', name: 'Team', is_system: 1 };
 * const result = convertSQLiteBooleans(team, ['isSystem']);
 * // Returns: { id: '1', name: 'Team', isSystem: true }
 *
 * @example
 * // Multiple fields
 * const user = { id: '1', is_active: 1, is_verified: 0 };
 * const result = convertSQLiteBooleans(user, ['isActive', 'isVerified']);
 * // Returns: { id: '1', isActive: true, isVerified: false }
 *
 * @example
 * // Keep original fields
 * const team = { id: '1', is_system: 1 };
 * const result = convertSQLiteBooleans(team, ['isSystem'], { keepOriginal: true });
 * // Returns: { id: '1', is_system: 1, isSystem: true }
 */
export function convertSQLiteBooleans(
  obj,
  booleanFields,
  options = { keepOriginal: false },
) {
  // Create a shallow copy to avoid mutating the original object
  const result = { ...obj };

  for (const field of booleanFields) {
    // Convert camelCase to snake_case for database column lookup
    const dbField = camelToSnake(field);

    // Check both snake_case (legacy) and camelCase (SQL aliases) formats
    if (result[dbField] !== undefined) {
      // Legacy format: snake_case field exists
      // Convert SQLite integer to boolean
      // 1 = true, 0 = false, null/undefined = false, other values = truthy/falsy
      result[field] = result[dbField] === 1 || Boolean(result[dbField]);

      // Remove the snake_case version unless keepOriginal is true
      if (!options.keepOriginal) {
        delete result[dbField];
      }
    } else if (result[field] !== undefined) {
      // New format: camelCase field already exists (from SQL aliases)
      // Just convert the value in place
      const value = result[field];
      result[field] = value === 1 || Boolean(value);
    }
  }

  return result;
}

/**
 * Convert SQLite boolean integers to JavaScript booleans for an array of objects
 *
 * This is a convenience function that applies convertSQLiteBooleans to each
 * object in an array. All options are passed through to the individual conversions.
 *
 * @param {Object[]} array - Array of objects containing SQLite data
 * @param {string[]} booleanFields - Array of camelCase field names to convert
 * @param {Object} [options] - Conversion options (passed to convertSQLiteBooleans)
 * @param {boolean} [options.keepOriginal=false] - Keep original snake_case fields
 * @returns {Object[]} New array with converted boolean fields
 *
 * @example
 * const teams = [
 *   { id: '1', name: 'Team A', is_system: 1 },
 *   { id: '2', name: 'Team B', is_system: 0 }
 * ];
 * const result = convertSQLiteBooleansArray(teams, ['isSystem']);
 * // Returns: [
 * //   { id: '1', name: 'Team A', isSystem: true },
 * //   { id: '2', name: 'Team B', isSystem: false }
 * // ]
 */
export function convertSQLiteBooleansArray(array, booleanFields, options) {
  return array.map((obj) => convertSQLiteBooleans(obj, booleanFields, options));
}
