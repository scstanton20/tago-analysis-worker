// backend/src/middleware/errorHandler.js
function errorHandler(err, _req, res) {
  console.error(err.stack);
  res.status(500).json({
    error: err.message || 'Internal Server Error',
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
}

export default errorHandler;
