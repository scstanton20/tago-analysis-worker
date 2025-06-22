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

**Tago Analysis Runner** is a full-stack monorepo application for managing and running Tago.io analysis scripts with real-time monitoring capabilities.

### Tech Stack

- **Frontend**: React 19 + Vite + Mantine 8.x UI library
- **Backend**: Node.js 22+ ES modules + Express.js 5.x + WebSocket
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
│   │   ├── utils/             # Crypto, WebSocket, storage utilities
│   │   └── server.js          # Application entry point
│   └── analyses-storage/       # File storage for uploaded analyses
└── frontend/                   # React SPA
    ├── src/
    │   ├── components/         # UI components
    │   ├── contexts/          # WebSocket context for real-time updates
    │   └── services/          # Frontend API layer
    └── public/
```

### Key Patterns

- **Backend**: MVC with service layer, custom AnalysisProcess model for managing child processes
- **Frontend**: Component-based with WebSocket context for real-time state management
- **Real-time Communication**: WebSocket integration for live status updates and log streaming
- **Department Organization**: Hierarchical structure with drag-and-drop management
- **Security**: Encryption utilities for sensitive configuration data

### Development Workflow

1. **Prerequisites**: Node.js 22+, pnpm 10.12.1+
2. **Install**: `pnpm install` (monorepo-wide)
3. **Start**: `pnpm dev` (both frontend and backend)
4. **Access**: Frontend at http://localhost:5173, Backend API at http://localhost:3000/api

### Environment Variables

- `SECRET_KEY`: Required in production for encryption
- `STORAGE_BASE`: Optional custom storage path
- `NODE_ENV`: development/production
- `PORT`: Backend port (defaults to 3000)

### Code Quality

- ESLint 9 with security and React-specific rules
- Prettier formatting
- Security-focused linting plugins
- Prepared for TypeScript migration

The application manages Tago.io analysis script execution with department-based organization, real-time process monitoring, and secure configuration storage.
