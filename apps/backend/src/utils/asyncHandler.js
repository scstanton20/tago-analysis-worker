/** Async handler wrapper for Express route handlers to catch promise rejections */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
