// backend/src/docs/swagger.js
import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Tago Analysis Runner API',
      version: '2.0.0',
      description:
        'API for managing and running Tago.io analysis scripts with real-time monitoring capabilities. Features Server-Sent Events (SSE) for real-time updates with simplified authentication.',
    },
    servers: [
      {
        url:
          process.env.NODE_ENV === 'production'
            ? '/api'
            : 'http://localhost:3000/api',
        description:
          process.env.NODE_ENV === 'production'
            ? 'Production server'
            : 'Development server',
      },
    ],
    components: {
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              description: 'Error message',
            },
            code: {
              type: 'string',
              description: 'Error code',
            },
          },
          required: ['error'],
        },
        SecurityInfo: {
          type: 'object',
          description: `**Password Security:**
            
This API uses industry-standard **Argon2id** password hashing for maximum security:
**Password Requirements:**
- Minimum 6 characters (recommended: 12+ characters)
- No maximum length limit
- All character types supported
- Unicode support for international passwords`,
        },
        RealTimeInfo: {
          type: 'object',
          description: `**Real-time Updates:**
            
This API provides real-time updates via **Server-Sent Events (SSE)** for:
- Analysis status changes and log streaming
- System health monitoring
- Department management updates
- Session management notifications

**Migration from WebSocket:**
- Simplified authentication (single HTTP cookie-based auth)
- Built-in browser reconnection support
- Standard HTTP-based protocol
- Same functionality as previous WebSocket implementation

**SSE Endpoint:** \`GET /api/sse/events\`
**Authentication:** HTTP-only cookies (access_token)
**Connection:** Persistent keep-alive with automatic reconnection`,
        },
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Unique user identifier',
            },
            username: {
              type: 'string',
              description: 'Username',
            },
            email: {
              type: 'string',
              format: 'email',
              description: 'User email address',
            },
            role: {
              type: 'string',
              enum: ['admin', 'user'],
              description: 'User role',
            },
            permissions: {
              type: 'object',
              description: 'User permissions object',
            },
            mustChangePassword: {
              type: 'boolean',
              description: 'Whether user must change password on next login',
            },
          },
        },
        LoginRequest: {
          type: 'object',
          properties: {
            username: {
              type: 'string',
              description: 'Username or email',
            },
            password: {
              type: 'string',
              description: 'User password (hashed with Argon2id for storage)',
              minLength: 6,
            },
          },
          required: ['username', 'password'],
        },
        LoginResponse: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'Success message',
            },
            user: {
              $ref: '#/components/schemas/User',
            },
          },
        },
        Analysis: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Analysis name',
            },
            status: {
              type: 'string',
              enum: ['stopped', 'running', 'error'],
              description: 'Current analysis status',
            },
            type: {
              type: 'string',
              enum: ['listener', 'scheduled'],
              description: 'Analysis execution type',
            },
            department: {
              type: 'string',
              description: 'Department ID this analysis belongs to',
            },
            enabled: {
              type: 'boolean',
              description: 'Whether analysis is enabled',
            },
            lastRun: {
              type: 'string',
              format: 'date-time',
              description: 'Last execution timestamp',
            },
            schedule: {
              type: 'string',
              description: 'Cron schedule for scheduled analyses',
            },
          },
        },
        Department: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Unique department identifier',
            },
            name: {
              type: 'string',
              description: 'Department name',
            },
            color: {
              type: 'string',
              description: 'Department color (hex format)',
            },
            order: {
              type: 'number',
              description: 'Display order',
            },
          },
        },
      },
    },
  },
  apis: [path.join(__dirname, '../routes/*.js')],
};

const specs = swaggerJSDoc(options);

export { specs, swaggerUi };
