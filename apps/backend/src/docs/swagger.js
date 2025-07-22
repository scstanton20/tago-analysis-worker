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
      description: `
# Tago Analysis Runner API

API for managing and running Tago.io analysis scripts with real-time monitoring capabilities. Features Server-Sent Events (SSE) for real-time updates with simplified authentication.

## Authentication

This API uses **Better Auth** for authentication with cookie-based sessions. The session token is stored in an HTTP-only cookie named \`better-auth.session_token\`.

### Better Auth Endpoints

The following Better Auth endpoints are available at \`/api/auth/*\` but are not fully documented in this Swagger spec.

**Note:** Most user and team management is handled through the custom \`/api/users/*\` and \`/api/teams/*\` endpoints documented in this API for better integration with the application's Better Auth permission system.

## Real-time Updates

This API provides real-time updates via **Server-Sent Events (SSE)** for:
- Analysis status changes and log streaming
- System health monitoring  
- Team/department management updates
- Session management notifications

**SSE Endpoint:** \`GET /api/sse/events\`
**Authentication:** Uses the same cookie-based session authentication
**Connection:** Persistent keep-alive with automatic browser reconnection support

## Permissions System

The application uses a team-based permissions system with the following permissions:
- \`upload_analyses\` - Upload new analysis files
- \`view_analyses\` - View analysis files and logs
- \`run_analyses\` - Start/stop analysis execution
- \`edit_analyses\` - Edit analysis content and environment variables
- \`delete_analyses\` - Delete analysis files
- \`download_analyses\` - Download analysis files and logs
- \`manage_users\` - Manage user accounts (admin only)
- \`manage_departments\` - Manage teams/departments (admin only)

Users can have different permissions in different teams, and admin users have global access to all functionality.
      `,
    },
    servers: [
      {
        url:
          process.env.NODE_ENV === 'production'
            ? '/api'
            : 'http://localhost:5173/api',
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
              description: 'User password',
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
        Team: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Unique team identifier',
            },
            name: {
              type: 'string',
              description: 'Team name',
            },
            color: {
              type: 'string',
              description: 'Team color (hex format)',
            },
            order: {
              type: 'number',
              description: 'Display order',
            },
          },
        },
        Department: {
          $ref: '#/components/schemas/Team',
          description:
            'Alias for Team - departments and teams are the same entity',
        },
        TeamCreateRequest: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Team name',
            },
            color: {
              type: 'string',
              description: 'Team color (hex format)',
              example: '#3b82f6',
            },
            order: {
              type: 'number',
              description: 'Display order',
              example: 1,
            },
          },
          required: ['name'],
        },
        TeamUpdateRequest: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Team name',
            },
            color: {
              type: 'string',
              description: 'Team color (hex format)',
            },
            order: {
              type: 'number',
              description: 'Display order',
            },
          },
        },
        AnalysisLogs: {
          type: 'object',
          properties: {
            logs: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  timestamp: {
                    type: 'string',
                    description: 'Log entry timestamp',
                  },
                  level: {
                    type: 'string',
                    enum: ['info', 'warn', 'error', 'debug'],
                    description: 'Log level',
                  },
                  message: {
                    type: 'string',
                    description: 'Log message',
                  },
                },
              },
            },
            pagination: {
              type: 'object',
              properties: {
                page: {
                  type: 'number',
                  description: 'Current page number',
                },
                limit: {
                  type: 'number',
                  description: 'Number of entries per page',
                },
                total: {
                  type: 'number',
                  description: 'Total number of log entries',
                },
              },
            },
          },
        },
        AnalysisVersion: {
          type: 'object',
          properties: {
            version: {
              type: 'integer',
              description: 'Version number',
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: 'When this version was created',
            },
            size: {
              type: 'integer',
              description: 'File size in bytes',
            },
          },
        },
        AnalysisVersionsResponse: {
          type: 'object',
          properties: {
            versions: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/AnalysisVersion',
              },
            },
            nextVersionNumber: {
              type: 'integer',
              description: 'Next version number that will be used',
            },
          },
        },
        AnalysisEnvironment: {
          type: 'object',
          additionalProperties: {
            type: 'string',
          },
          description: 'Environment variables as key-value pairs',
          example: {
            API_TOKEN: 'your-token-here',
            DEBUG: 'true',
          },
        },
        UserTeamMembership: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Team ID',
            },
            name: {
              type: 'string',
              description: 'Team name',
            },
            role: {
              type: 'string',
              description: 'User role in team',
              default: 'member',
            },
            permissions: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'Array of permission strings',
              example: ['upload_analyses', 'view_analyses', 'run_analyses'],
            },
          },
        },
        TeamAssignment: {
          type: 'object',
          properties: {
            teamId: {
              type: 'string',
              description: 'Team ID to assign user to',
            },
            permissions: {
              type: 'array',
              items: {
                type: 'string',
                enum: [
                  'upload_analyses',
                  'view_analyses',
                  'run_analyses',
                  'edit_analyses',
                  'delete_analyses',
                  'download_analyses',
                ],
              },
              description: 'Array of permissions to grant',
              example: ['view_analyses', 'run_analyses'],
            },
          },
          required: ['teamId'],
        },
        SuccessResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true,
            },
            message: {
              type: 'string',
              description: 'Success message',
            },
          },
        },
        BetterAuthInfo: {
          type: 'object',
          description: `**Better Auth Endpoints:**
            
This API uses Better Auth for authentication. The following Better Auth endpoints are available but not documented here:

**Authentication:**
- \`POST /api/auth/sign-in/email\` - Email/password login
- \`POST /api/auth/sign-up/email\` - Email/password registration
- \`POST /api/auth/sign-out\` - Sign out
- \`GET /api/auth/get-session\` - Get current session

**Password Management:**
- \`POST /api/auth/forget-password\` - Request password reset
- \`POST /api/auth/reset-password\` - Reset password with token
- \`POST /api/auth/change-password\` - Change password when authenticated

**Organization Management:**
- \`POST /api/auth/organization/create\` - Create organization
- \`GET /api/auth/organization/list\` - List user organizations
- \`POST /api/auth/organization/invite\` - Invite user to organization

**WebAuthn/Passkey Support:**
- \`POST /api/auth/passkey/register\` - Register passkey
- \`POST /api/auth/passkey/authenticate\` - Authenticate with passkey

**Note:** Most user management is handled through the custom \`/api/users/*\` endpoints documented in this API for better integration with the team permission system.`,
        },
      },
    },
  },
  apis: [path.join(__dirname, '../routes/*.js')],
};

const specs = swaggerJSDoc(options);

export { specs, swaggerUi };
