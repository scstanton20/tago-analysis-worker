/**
 * API Type Guards
 *
 * Runtime type guards for API responses.
 */

import type {
  ApiSuccessResponse,
  ApiErrorResponse,
  ApiResponse,
} from '../api/responses.js';

/** Check if response is a success response */
export function isApiSuccess<T>(
  response: ApiResponse<T>,
): response is ApiSuccessResponse<T> {
  return response.success === true;
}

/** Check if response is an error response */
export function isApiError(
  response: ApiResponse,
): response is ApiErrorResponse {
  return response.success === false;
}

/** Type guard for checking if value is an object */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Type guard for checking if value is a non-empty string */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/** Type guard for checking if value is a valid ID (non-empty string) */
export function isValidId(value: unknown): value is string {
  return isNonEmptyString(value);
}

/** Type guard for checking if value is a valid timestamp */
export function isValidTimestamp(value: unknown): value is number {
  return typeof value === 'number' && value > 0 && Number.isFinite(value);
}

/** Type guard for checking if value is a valid date string */
export function isValidDateString(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const date = new Date(value);
  return !isNaN(date.getTime());
}

/** Extract data from API response or throw error */
export function unwrapApiResponse<T>(response: ApiResponse<T>): T {
  if (isApiSuccess(response)) {
    return response.data;
  }
  throw new Error(response.error);
}

/** Safely extract data from API response */
export function safeUnwrapApiResponse<T>(
  response: ApiResponse<T>,
): { data: T; error: null } | { data: null; error: string } {
  if (isApiSuccess(response)) {
    return { data: response.data, error: null };
  }
  return { data: null, error: response.error };
}
