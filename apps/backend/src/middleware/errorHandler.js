// backend/src/middleware/errorHandler.js
const errorHandler = (err, req, res, next) => {
  // Check if res has status method (Express response object)
  if (typeof res.status !== 'function') {
    console.error('Error handler called with invalid response object:', err);
    return next(err);
  }

  console.error('Error:', err);

  // Default to 500 server error
  let statusCode = 500;
  let message = 'Internal Server Error';

  // Handle different error types
  if (err.statusCode) {
    statusCode = err.statusCode;
  }

  if (err.message) {
    message = err.message;
  }

  // Handle specific error types
  if (err.code === 'ENOENT') {
    statusCode = 404;
    message = 'File not found';
  }

  if (err.code === 'EACCES') {
    statusCode = 403;
    message = 'Permission denied';
  }

  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

export default errorHandler;
