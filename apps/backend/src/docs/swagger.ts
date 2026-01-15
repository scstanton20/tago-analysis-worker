import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateOpenAPISchemas } from '@tago-analysis-worker/types/openapi';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface SwaggerOptions {
  definition: {
    openapi: string;
    info: {
      title: string;
      version: string;
      description: string;
    };
    servers: Array<{
      url: string;
      description: string;
    }>;
    components: {
      schemas: Record<string, unknown>;
    };
  };
  apis: string[];
}

const options: SwaggerOptions = {
  definition: {
    openapi: '3.1.0',
    info: {
      title: 'Tago Analysis Worker API',
      version: '2.0.0',
      description: `
API for managing and running Tago.io analysis scripts with real-time monitoring capabilities. Features Server-Sent Events (SSE) for real-time updates with simplified authentication.

## Authentication

This API uses **Better-Auth** for authentication with cookie-based sessions. The session token is stored in an HTTP-only cookie named \`better-auth.session_token\`.

### Better-Auth Endpoints

The following Better-Auth endpoints are available at \`/api/auth/*\` but are not fully documented in this Swagger spec.

**Note:** Most user and team management is handled through the custom \`/api/users/*\` and \`/api/teams/*\` endpoints documented in this API for better integration with the application's Better-Auth permission system.

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

| Permission | Description |
|------------|-------------|
| \`upload_analyses\` | Upload new analysis files |
| \`view_analyses\` | View analysis files and logs |
| \`run_analyses\` | Start/stop analysis execution |
| \`edit_analyses\` | Edit analysis content and environment variables |
| \`delete_analyses\` | Delete analysis files |
| \`download_analyses\` | Download analysis files and logs |
| \`manage_users\` | Manage user accounts (admin only) |
| \`manage_departments\` | Manage teams/departments (admin only) |

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
      // Generate schemas from Zod definitions in the shared types package
      schemas: generateOpenAPISchemas(),
    },
  },
  // Look for both .ts and .js files to support JSDoc comments in routes
  apis: [
    path.join(__dirname, '../routes/*.ts'),
    path.join(__dirname, '../routes/*.js'),
  ],
};

const specs = swaggerJSDoc(options);

export { specs, swaggerUi };
