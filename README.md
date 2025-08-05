# Tago Analysis Runner

A full-stack application for managing and running Tago.io analysis scripts with real-time monitoring capabilities.

## Features

- 🔧 **Analysis Management**: Upload, run, stop, and monitor Tago.io analysis scripts
- 🏢 **Department Organization**: Hierarchical organization with drag-and-drop management
- 👥 **User Management**: Role-based access control with fine-grained permissions
- 📊 **Real-time Monitoring**: Live status updates and log streaming via Server-Sent Events (SSE)
- 🔐 **Secure Authentication**: Better Auth components for session and user management
- 📱 **Modern UI**: Built with Mantine components and responsive design
- 🔔 **Notifications**: Contextual feedback for all user operations

## Tech Stack

- **Frontend**: React 19 + Vite + Mantine 8.x
- **Backend**: Node.js 22+ + Express.js 5.x + Server-Sent Events
- **Package Manager**: pnpm workspaces
- **Authentication**: Better Auth
- **Real-time**: Server-Sent Events (SSE)
- **Security**: Encryption for sensitive data

## Quick Start

### Prerequisites

- Node.js 22+
- pnpm 10.13.1+

### Installation

```bash
# Clone the repository
git clone [<repository-url>](https://github.com/scstanton20/tago-analysis-runner)
cd tago-analysis-runner

# Install dependencies
pnpm install

# Start development servers
pnpm dev
```

### Access

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3000/api
- **API Documentation**: http://localhost:3000/api/docs

### First Time Setup

When you first run the application, an admin user will be automatically created:

```
Email: admin@example.com
Username: admin
Password: admin123
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

```bash
docker-compose -f docker-configs/development/docker-compose.dev.yaml up
```

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

This Tago Analysis runner matches the TagoIO SDK for JavaScript and Node.js usage terms under the [Apache-2.0 License](https://github.com/scstanton20/tago-analysis-runner/blob/main/LICENSE.md).
