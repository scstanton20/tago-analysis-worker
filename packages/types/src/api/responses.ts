/**
 * API Response Types
 *
 * Standard response wrappers for all API endpoints.
 */

/** Standard success response */
export type ApiSuccessResponse<TData = unknown> = {
  success: true;
  data: TData;
  message?: string;
};

/** Standard error response */
export type ApiErrorResponse = {
  success: false;
  error: string;
  code?: string;
  details?: Record<string, unknown>;
  /** Stack trace (only in development) */
  stack?: string;
};

/** Validation error detail */
export type ValidationErrorDetail = {
  /** Path to the invalid field */
  path: string;
  /** Validation error message */
  message: string;
  /** Zod error code */
  code: string;
};

/** Validation error codes */
export type ValidationErrorCode =
  | 'INVALID_REQUEST_BODY'
  | 'INVALID_QUERY_PARAMETERS'
  | 'INVALID_ROUTE_PARAMETERS'
  | 'INVALID_FILENAME';

/** Validation error response */
export type ValidationErrorResponse = {
  /** Error message */
  error: string;
  /** Validation error code */
  code: ValidationErrorCode;
  /** Array of validation error details */
  details: Array<ValidationErrorDetail>;
};

/** Union of success/error responses */
export type ApiResponse<TData = unknown> =
  | ApiSuccessResponse<TData>
  | ApiErrorResponse;

/** Paginated response wrapper */
export type PaginatedResponse<TItem> = {
  items: Array<TItem>;
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
};

/** Batch operation result */
export type BatchOperationResult = {
  succeeded: Array<string>;
  failed: Array<{
    id: string;
    error: string;
  }>;
};
