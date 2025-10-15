/**
 * Async handler wrapper for Express route handlers
 *
 * Wraps async route handlers to catch promise rejections and pass them to Express error middleware.
 * This prevents unhandled promise rejections and ensures all errors are properly logged and handled.
 *
 * @param {Function} fn - Async route handler function (req, res, next) => Promise
 * @returns {Function} Wrapped function that catches promise rejections
 *
 * @example
 * router.get('/users', asyncHandler(async (req, res) => {
 *   const users = await UserService.getAll();
 *   res.json(users);
 * }));
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
