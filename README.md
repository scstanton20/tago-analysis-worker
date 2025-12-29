# Tago Analysis Worker

A full-stack application for managing and running Tago.io analysis scripts with real-time monitoring capabilities.

## Features

- 🔧 **Analysis Management & Runtime**: Upload, run, stop, and monitor Tago.io analysis scripts. Uses Node's Permission Model to sandbox each process.
- 🏢 **Department Organization**: Hierarchical organization with drag-and-drop management
- 👥 **User Management**: Role-based access control with fine-grained permissions
- 📊 **Real-time Monitoring**: Live status updates, metrics, and log streaming via Prom-Client and Server-Sent Events (SSE)
- 🔐 **Secure Authentication**: Better Auth components for session and user management
- 🌐 **DNS Caching**: Intelligent DNS resolution caching for improved network performance
- 📱 **Modern UI**: Built with Mantine components and responsive design
- 🔔 **Notifications**: Contextual feedback for all user operations

## Tech Stack

- **Frontend**: React 19 + Vite + Mantine 8.x
- **Backend**: Node.js + Express.js 5.x + Server-Sent Events + Typescript
- **Package Manager**: pnpm workspaces
- **Authentication**: Better Auth
- **Real-time**: Server-Sent Events (SSE)
- **Security**: Encryption for sensitive data
- **Docker Containerization**: Images are built using docker

## Quick Start

### Prerequisites

- Node.js 24.3.0+
- pnpm 10.13.1+

### Installation

```bash
# Clone the repository
git clone [<repository-url>](https://github.com/scstanton20/tago-analysis-worker)
cd tago-analysis-worker

# Install dependencies
pnpm install

# Start development servers
pnpm dev
```

### Access

**Development:**

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3000/api
- **API Documentation**: http://localhost:3000/api/docs

**Production (Docker):**

- **Frontend**: https://localhost:8443
- **Backend API**: https://localhost:8443/api
- **API Documentation**: https://localhost:8443/api/docs

### First Time Setup

When you first run the application, an admin user will be automatically created:

```
Email: admin@example.com
Username: admin
Password: Admin123
```

**⚠️ Important**: You'll be prompted to change this password on first login for security.

## Development Commands

```bash
pnpm dev                # Start both frontend and backend
pnpm dev:frontend       # Start frontend only
pnpm dev:backend        # Start backend only
pnpm format             # Format code with Prettier
pnpm lint               # Lint all code
pnpm lint:fix           # Fix linting issues
```

## Docker Development

For development with Docker (HTTP only):

```bash
docker-compose -f docker-configs/development/docker-compose.dev.yaml up
```

## Production Docker with HTTPS

The production Docker configuration includes built-in HTTPS support with self-signed certificates generated at build time.

### Quick Production Start

```bash
# Build and run production containers
docker-compose -f docker-compose.prod.yaml up
```

Access via HTTPS: https://localhost:8443

### HTTPS Configuration

Both frontend (nginx) and backend (Node.js) support HTTPS in production:

- **Frontend**: nginx with HTTP/2 on port 443
- **Backend**: Express.js with HTTPS on port 3443
- **Auto-generated certificates**: Self-signed RSA 2048-bit certificates
- **Production-only**: HTTP is disabled in production for security

### Custom SSL Certificates

You can provide your own SSL certificates by mounting them and setting the HTTPS environment variables (see [Environment Variables](#https-configuration)):

```yaml
# docker-compose.prod.yaml
services:
  frontend:
    environment:
      NGINX_CERT_FILE: /custom/certs/frontend.crt
      NGINX_CERT_KEYFILE: /custom/certs/frontend.key
    volumes:
      - /host/path/to/certs:/custom/certs:ro

  backend:
    environment:
      CERT_FILE: /custom/certs/backend.crt
      CERT_KEYFILE: /custom/certs/backend.key
    volumes:
      - /host/path/to/certs:/custom/certs:ro
```

**Note**: Custom certificates override the auto-generated ones. Containers will fail to start if specified certificate files don't exist.

## Authentication System

This application uses **Better Auth** for comprehensive authentication and authorization:

### Features

- 🔐 **Username/Email + Password** authentication
- 🏢 **Organization Management** with team-based permissions
- 👥 **Role-Based Access Control** (Admin, User roles)
- 🔑 **WebAuthn/Passkey Support** (production)
- 🛡️ **Session Management** with secure cookies

### User Roles & Permissions

#### Admin Users

- Full system access
- User management (create, edit, delete users)
- Organization and team management
- All analysis operations

#### Regular Users

- Access based on team memberships
- Team-specific analysis permissions:
  - `analysis.view` - View analyses in assigned teams
  - `analysis.run` - Start/stop analyses in assigned teams
  - `analysis.edit` - Modify analyses in assigned teams

### Team Management

- Users are assigned to teams with specific permissions
- Analyses are organized within teams
- Hierarchical organization structure with drag-and-drop support

## Environment Variables

### Core Configuration

```bash
SECRET_KEY=your-secret-key              # Required for encryption
PRODUCTION_DOMAIN=your-domain.com       # Required for WebAuthn in production
NODE_ENV=development                    # development/production
PORT=3000                              # Server port (optional)
STORAGE_BASE=./analyses-storage        # Storage path (optional)
```

### HTTPS Configuration

```bash
# Backend HTTPS Settings
CERT_FILE=/app/certs/backend.crt       # Backend SSL certificate path
CERT_KEYFILE=/app/certs/backend.key        # Backend SSL private key path
HTTPS_PORT=3443                        # Backend HTTPS port (optional, defaults to 3443)

# Frontend HTTPS Settings
NGINX_CERT_FILE=/etc/ssl/certs/tago-worker.crt    # Frontend SSL certificate path
NGINX_CERT_KEYFILE=/etc/ssl/private/tago-worker.key   # Frontend SSL private key path
```

**Note**: HTTPS is automatically enabled when both certificate and key paths are provided. In production (`NODE_ENV=production`), only HTTPS is available for security.

### Logging Configuration

```bash
LOG_LEVEL=info                         # Override log level (debug/info/warn/error)
LOG_INCLUDE_MODULE=false               # Show module names in console (default: false)
```

### External Logging (Grafana Loki)

```bash
LOG_LOKI_URL=http://localhost:3100     # Loki server URL
LOG_LOKI_USERNAME=username             # Optional authentication
LOG_LOKI_PASSWORD=password             # Optional authentication
LOG_LOKI_LABELS=version=1.0.0,dc=us-east-1  # Additional labels (optional)
LOG_LOKI_BATCHING=true                 # Enable batching (default: true)
LOG_LOKI_INTERVAL=5000                 # Batch interval in ms (default: 5000)
LOG_LOKI_TIMEOUT=30000                 # Request timeout in ms (default: 30000)
```

## License

This Tago Analysis worker matches the TagoIO SDK for JavaScript and Node.js usage terms under the [Apache-2.0 License](https://github.com/scstanton20/tago-analysis-worker/blob/main/LICENSE.md).
