# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development

```bash
pnpm dev                # Start both frontend and backend in development
pnpm dev:frontend       # Start frontend only
pnpm dev:backend        # Start backend only
pnpm format             # Format code with Prettier
pnpm format:check       # Check code formatting
pnpm lint               # Lint all code
pnpm lint:fix           # Fix linting issues
```

### Docker Development

```bash
docker-compose -f docker-compose.dev.yaml up
```

## Architecture Overview

**Tago Analysis Worker** is a full-stack monorepo application for managing and running Tago.io analysis scripts with real-time monitoring capabilities.

### Tech Stack

- **Frontend**: React 19 + Vite + Mantine 8.x UI library
- **Backend**: Node.js 22+ ES modules + Express.js 5.x + SSE
- **Package Manager**: pnpm workspaces
- **Containerization**: Docker with multi-stage builds

### Monorepo Structure

```
apps/
├── backend/                    # Express.js API server
│   ├── src/
│   │   ├── controllers/        # Route handlers
│   │   ├── services/          # Business logic (analysis, department services)
│   │   ├── models/            # AnalysisProcess model for process management
│   │   ├── utils/             # Crypto, SSE, storage utilities
│   │   └── server.js          # Application entry point
│   └── analyses-storage/       # File storage for uploaded analyses
└── frontend/                   # React SPA
    ├── src/
    │   ├── components/         # UI components
    │   ├── contexts/          # SSE context for real-time updates
    │   └── services/          # Frontend API layer
    └── public/
```

### Key Patterns

- **Backend**: MVC with service layer, custom AnalysisProcess model for managing child processes
- **Frontend**: Component-based with SSE context for real-time state management
- **Real-time Communication**: SSE integration for live status updates and log streaming
- **Department Organization**: Hierarchical structure with drag-and-drop management
- **Security**: Encryption utilities for sensitive configuration data
- **Notifications**: Mantine-based notification system for user feedback on async operations

### Development Workflow

1. **Prerequisites**: Node.js 22+, pnpm 10.12.1+
2. **Install**: `pnpm install` (monorepo-wide)
3. **Start**: `pnpm dev` (both frontend and backend)
4. **Access**: Frontend at http://localhost:5173, Backend API at http://localhost:3000/api

### Environment Variables

#### Core Configuration

- `SECRET_KEY`: Required in production for encryption
- `PRODUCTION_DOMAIN`: Required in production for WebAuthn
- `STORAGE_BASE`: Optional custom storage path (see Docker Volume Notes below)
- `NODE_ENV`: development/production
- `PORT`: Backend port (defaults to 3000)

#### Docker Volume Notes

When using `STORAGE_BASE` in production, you must also update the docker-compose volume mount:

- Default: `analysis-data:/app/analyses-storage`
- Custom: `analysis-data:${YOUR_CUSTOM_PATH}` and set `STORAGE_BASE=${YOUR_CUSTOM_PATH}`
- The volume mount path and `STORAGE_BASE` must match for data persistence

#### Logging Configuration

- `LOG_LEVEL`: Override log level (debug/info/warn/error)
- `LOG_INCLUDE_MODULE`: Set to 'true' to show module/analysis names in console (always sent to Loki)

#### External Logging (Grafana Loki)

- `LOG_LOKI_URL`: Loki server URL (e.g., http://localhost:3100)
- `LOG_LOKI_USERNAME`: Optional authentication username
- `LOG_LOKI_PASSWORD`: Optional authentication password
- `LOG_LOKI_LABELS`: Additional labels (format: key1=value1,key2=value2)
- `LOG_LOKI_BATCHING`: Enable batching (default: true)
- `LOG_LOKI_INTERVAL`: Batch interval in ms (default: 5000)
- `LOG_LOKI_TIMEOUT`: Request timeout in ms (default: 30000)

### Code Quality

- ESLint 9 with security and React-specific rules
- Prettier formatting
- Security-focused linting plugins
- Prepared for TypeScript migration

The application manages Tago.io analysis script execution with department-based organization, real-time process monitoring, and secure configuration storage.
