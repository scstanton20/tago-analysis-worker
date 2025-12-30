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
