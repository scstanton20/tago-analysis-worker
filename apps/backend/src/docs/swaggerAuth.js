// backend/src/docs/swaggerAuth.js
import { authMiddleware } from '../middleware/auth.js';

/**
 * Middleware to protect Swagger UI with authentication
 * Allows access to API docs only for authenticated users
 */
export const swaggerAuthMiddleware = async (req, res, next) => {
  // For Swagger UI static assets, allow access
  if (req.path.includes('/swagger-ui') && req.path.includes('.')) {
    return next();
  }

  // For the main docs page and API endpoints, require authentication
  try {
    await authMiddleware(req, res, next);
  } catch {
    // If authentication fails, show unauthorized
    return res.status(401);
  }
};

/**
 * Custom Swagger UI setup with authentication info
 */
export const swaggerUiOptions = {
  customCss: `
    .swagger-ui .topbar { display: none; }
    .swagger-ui .info .title { color: #3b4151; }
  `,
  customSiteTitle: 'Tago Analysis Runner API Docs',
  customfavIcon: '/favicon.ico',
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    filter: true,
    tryItOutEnabled: true,
    requestInterceptor: (req) => {
      // Add credentials to all requests
      req.credentials = 'include';
      return req;
    },
  },
};
