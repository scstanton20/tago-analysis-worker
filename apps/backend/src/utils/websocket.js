// backend/src/utils/websocket.js
import { WebSocketServer } from 'ws';

let wss = null;
const clients = new Set();

function setupWebSocket(server) {
  if (wss !== null) {
    return wss;
  }

  wss = new WebSocketServer({
    server,
    path: '/ws',
    clientTracking: true,
  });
  console.log('Setting up WebSocket server');

  wss.on('connection', async (ws) => {
    console.log('New WebSocket connection established');
    clients.add(ws);

    try {
      const { analysisService } = await import(
        '../services/analysisService.js'
      );
      const analyses = await analysisService.getAllAnalyses();

      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'init',
            analyses,
          }),
        );

        // Send initial status when client connects
        await sendStatusUpdate(ws);
      }
    } catch (error) {
      console.error('Error sending initial state:', error);
    }

    // Handle status requests from client
    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message.toString());

        if (data.type === 'requestStatus') {
          await sendStatusUpdate(ws);
        }
      } catch (error) {
        console.error('Error handling WebSocket message:', error);
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      console.log('WebSocket connection closed');
    });

    ws.on('error', (error) => {
      clients.delete(ws);
      console.error('WebSocket connection error:', error);
    });
  });

  return wss;
}

// Helper function to send status update to a specific client
async function sendStatusUpdate(client) {
  try {
    const { analysisService } = await import('../services/analysisService.js');
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    const ms = (await import('ms')).default;

    // Get container state - we'll need to import this from server.js or make it accessible
    const containerState = getContainerState(); // We'll need to implement this

    const runningAnalyses = Array.from(
      analysisService.analyses.values(),
    ).filter((analysis) => analysis.status === 'running');

    // Get Tago SDK version from package.json
    let tagoVersion;
    try {
      const packageJson = require('@tago-io/sdk/package.json');
      tagoVersion = packageJson.version;
    } catch (error) {
      console.error('Error reading tago SDK version:', error);
      tagoVersion = 'unknown';
    }

    const status = {
      container_health: {
        status: containerState.status === 'ready' ? 'healthy' : 'initializing',
        message: containerState.message,
        uptime: {
          seconds: Math.floor((new Date() - containerState.startTime) / 1000),
          formatted: ms(new Date() - containerState.startTime, {
            long: true,
          }),
        },
      },
      tagoConnection: {
        sdkVersion: tagoVersion,
        runningAnalyses: runningAnalyses.length,
      },
      serverTime: new Date().toString(),
    };

    if (client.readyState === WebSocket.OPEN) {
      client.send(
        JSON.stringify({
          type: 'statusUpdate',
          data: status,
        }),
      );
    }
  } catch (error) {
    console.error('Error sending status update:', error);
  }
}

function broadcastUpdate(type, data) {
  if (!wss || clients.size === 0) return;

  const message = JSON.stringify({ type, data });

  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(message);
      } catch {
        clients.delete(client);
      }
    }
  });
}

async function broadcastRefresh() {
  if (!wss || clients.size === 0) return;

  try {
    const { analysisService } = await import('../services/analysisService.js');
    const analyses = await analysisService.getAllAnalyses();

    const message = JSON.stringify({
      type: 'init',
      analyses,
    });

    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(message);
        } catch {
          clients.delete(client);
        }
      }
    });
  } catch (error) {
    console.error('Error broadcasting refresh:', error);
  }
}

// Broadcast status updates to all connected clients
async function broadcastStatusUpdate() {
  if (!wss || clients.size === 0) return;

  clients.forEach(async (client) => {
    if (client.readyState === WebSocket.OPEN) {
      await sendStatusUpdate(client);
    }
  });
}

// Container state management - needs to be accessible from server.js
let containerState = {
  status: 'starting',
  startTime: new Date(),
  message: 'Container is starting',
};

function updateContainerState(newState) {
  containerState = { ...containerState, ...newState };
  // Broadcast status update when container state changes
  broadcastStatusUpdate();
}

function getContainerState() {
  return containerState;
}

export {
  setupWebSocket,
  broadcastUpdate,
  broadcastRefresh,
  broadcastStatusUpdate,
  updateContainerState,
  getContainerState,
};
