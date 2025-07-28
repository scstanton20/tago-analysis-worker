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
- **API Documentation**: http://localhost:5173/api/docs

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

## Environment Variables

### Backend (.env)

```bash
SECRET_KEY=your-secret-key              # Required for encryption
PRODUCTION_DOMAIN=your-domain.com       # Required for WebAuthn in production
NODE_ENV=development                    # development/production
PORT=3000                              # Server port (optional)
STORAGE_BASE=./analyses-storage        # Storage path (optional)
```

## License

This Tago Analysis runner matches the TagoIO SDK for JavaScript and Node.js usage terms under the [Apache-2.0 License](https://github.com/scstanton20/tago-analysis-runner/blob/main/LICENSE.md).
