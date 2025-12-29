/**
 * Database Helper Utilities
 * Provides conversion utilities for SQLite data types to JavaScript types
 *
 * SQLite stores booleans as integers (0 or 1), and these utilities help convert
 * them back to JavaScript boolean types when retrieving data from the database.
 */

interface ConversionOptions {
  keepOriginal?: boolean;
}

/**
 * Convert a camelCase field name to snake_case for database column lookup
 * @param camelCase - Field name in camelCase format
 * @returns Field name in snake_case format
 *
 * @example
 * camelToSnake('isSystem') // returns 'is_system'
 * camelToSnake('isEmailVerified') // returns 'is_email_verified'
 */
function camelToSnake(camelCase: string): string {
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
 * @param obj - Object containing snake_case fields
 * @param fieldNames - Array of camelCase field names to convert
 * @param options - Conversion options
 * @returns New object with converted field names
 */
export function convertSnakeCaseToCamelCase<T extends Record<string, unknown>>(
  obj: T,
  fieldNames: string[],
  options: ConversionOptions = { keepOriginal: false },
): T {
  // Create a shallow copy to avoid mutating the original object
  const result = { ...obj } as Record<string, unknown>;

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

  return result as T;
}

/**
 * Convert snake_case field names to camelCase for an array of objects
 *
 * @param array - Array of objects containing snake_case fields
 * @param fieldNames - Array of camelCase field names to convert
 * @param options - Conversion options
 * @returns New array with converted field names
 */
export function convertSnakeCaseToCamelCaseArray<
  T extends Record<string, unknown>,
>(array: T[], fieldNames: string[], options?: ConversionOptions): T[] {
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
 * @param obj - Object containing SQLite data
 * @param booleanFields - Array of camelCase field names to convert
 * @param options - Conversion options
 * @returns New object with converted boolean fields
 */
export function convertSQLiteBooleans<T extends Record<string, unknown>>(
  obj: T,
  booleanFields: string[],
  options: ConversionOptions = { keepOriginal: false },
): T {
  // Create a shallow copy to avoid mutating the original object
  const result = { ...obj } as Record<string, unknown>;

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

  return result as T;
}

/**
 * Convert SQLite boolean integers to JavaScript booleans for an array of objects
 *
 * @param array - Array of objects containing SQLite data
 * @param booleanFields - Array of camelCase field names to convert
 * @param options - Conversion options
 * @returns New array with converted boolean fields
 */
export function convertSQLiteBooleansArray<T extends Record<string, unknown>>(
  array: T[],
  booleanFields: string[],
  options?: ConversionOptions,
): T[] {
  return array.map((obj) => convertSQLiteBooleans(obj, booleanFields, options));
}
