/**
 * API Response Types
 *
 * Standard response wrappers for all API endpoints.
 */

/** Standard success response */
export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
  message?: string;
}

/** Standard error response */
export interface ApiErrorResponse {
  success: false;
  error: string;
  code?: string;
  details?: Record<string, unknown>;
}

/** Union of success/error responses */
export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

/** Paginated response wrapper */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/** Batch operation result */
export interface BatchOperationResult {
  succeeded: string[];
  failed: Array<{
    id: string;
    error: string;
  }>;
}
