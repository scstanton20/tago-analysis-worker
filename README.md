# Tago Analysis Runner

A full-stack application for managing and running Tago.io analysis scripts with real-time monitoring capabilities.

## Features

- 🔧 **Analysis Management**: Upload, run, stop, and monitor Tago.io analysis scripts
- 🏢 **Department Organization**: Hierarchical organization with drag-and-drop management
- 👥 **User Management**: Role-based access control with fine-grained permissions
- 📊 **Real-time Monitoring**: Live status updates and log streaming via WebSocket
- 🔐 **Secure Authentication**: JWT with refresh tokens and WebAuthn/passkey support
- 📱 **Modern UI**: Built with Mantine components and responsive design
- 🔔 **Smart Notifications**: Contextual feedback for all user operations

## Tech Stack

- **Frontend**: React 19 + Vite + Mantine 8.x
- **Backend**: Node.js 22+ + Express.js 5.x + WebSocket
- **Package Manager**: pnpm workspaces
- **Authentication**: JWT + WebAuthn (passkeys)
- **Real-time**: WebSocket integration
- **Security**: Encryption for sensitive data

## Quick Start

### Prerequisites

- Node.js 22+
- pnpm 10.12.1+

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

## Project Structure

```
apps/
├── backend/                    # Express.js API server
│   ├── src/
│   │   ├── controllers/        # Route handlers
│   │   ├── services/          # Business logic
│   │   ├── models/            # Data models
│   │   ├── utils/             # Utilities (crypto, WebSocket, etc.)
│   │   └── server.js          # Application entry point
│   └── analyses-storage/       # File storage for analyses
└── frontend/                   # React SPA
    ├── src/
    │   ├── components/         # UI components
    │   ├── contexts/          # React contexts (auth, WebSocket)
    │   ├── hooks/             # Custom React hooks
    │   └── services/          # API layer
    └── public/
```

## Key Features

### Analysis Management
- Upload JavaScript analysis files (.js/.cjs)
- Real-time execution monitoring
- Environment variable management
- Log viewing and downloading

### Department Organization
- Hierarchical department structure
- Drag-and-drop analysis organization
- Color-coded department visualization
- Permission-based access control

### User Management
- Role-based permissions (admin/user)
- Department-specific access control
- WebAuthn/passkey authentication
- Secure password management

### Real-time Updates
- Live analysis status updates
- Real-time log streaming
- WebSocket-based communication
- Automatic UI synchronization

## Security

- JWT authentication with secure refresh tokens
- WebAuthn support for passwordless authentication
- Encrypted storage for sensitive configuration
- Role-based access control (RBAC)
- Security-focused ESLint configuration

## License

This Tago Analysis runner matches the TagoIO SDK for JavaScript and Node.js usage terms under the [Apache-2.0 License](https://github.com/scstanton20/tago-analysis-runner/blob/main/LICENSE.md).