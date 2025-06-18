// backend/src/utils/websocket.js
import { WebSocketServer } from 'ws';
import departmentService from '../services/departmentService.js';

let wss = null;
const clients = new Set();

export function setupWebSocket(server) {
  if (wss !== null) {
    return wss;
  }

  wss = new WebSocketServer({
    server,
    path: '/ws',
    clientTracking: true,
  });
  console.log('WebSocket server setup complete');

  wss.on('connection', async (ws) => {
    console.log(`WebSocket connection established`);
    clients.add(ws);

    try {
      const { analysisService } = await import(
        '../services/analysisService.js'
      );

      // Get both analyses and departments
      const [analyses, departments] = await Promise.all([
        analysisService.getAllAnalyses(),
        departmentService.getAllDepartments(),
      ]);

      if (ws.readyState === ws.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'init',
            analyses,
            departments,
            version: '2.0',
          }),
        );

        // Send initial status when client connects
        await sendStatusUpdate(ws);
      }
    } catch (error) {
      console.error(`Error sending initial state for websocket`, error);
    }

    // Handle messages from client
    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message.toString());

        switch (data.type) {
          case 'requestStatus':
            await sendStatusUpdate(ws);
            break;

          case 'requestDepartments': {
            const departments = await departmentService.getAllDepartments();
            ws.send(
              JSON.stringify({
                type: 'departmentsUpdate',
                departments,
              }),
            );
            break;
          }

          case 'requestAnalysesByDepartment':
            if (data.departmentId) {
              const analyses = await departmentService.getAnalysesByDepartment(
                data.departmentId,
              );
              ws.send(
                JSON.stringify({
                  type: 'analysesByDepartment',
                  departmentId: data.departmentId,
                  analyses,
                }),
              );
            }
            break;

          // Handle refresh request
          case 'requestAnalyses': {
            const { analysisService } = await import(
              '../services/analysisService.js'
            );
            const [analyses, departments] = await Promise.all([
              analysisService.getAllAnalyses(),
              departmentService.getAllDepartments(),
            ]);

            ws.send(
              JSON.stringify({
                type: 'init',
                analyses,
                departments,
                version: '2.0',
              }),
            );
            break;
          }

          default:
            console.log(`Unknown WebSocket message type: ${data.type}`);
        }
      } catch (error) {
        console.error(`Error handling WebSocket message`, error);
      }
    });

    ws.on('close', (code, reason) => {
      clients.delete(ws);
      console.log(
        `WebSocket connection closed, Code: ${code}, Reason: ${reason.toString()})`,
      );
    });

    // Fixed: Use the error parameter
    ws.on('error', (error) => {
      clients.delete(ws);
      console.error(`WebSocket connection error`, error.message);
    });
  });

  return wss;
}

// Broadcast to all connected clients
export function broadcast(data) {
  if (!wss) return;

  const message = JSON.stringify(data);
  clients.forEach((client) => {
    if (client.readyState === client.OPEN) {
      try {
        client.send(message);
      } catch (error) {
        console.error(`Error broadcasting message`, error.message);
        clients.delete(client);
      }
    }
  });
}

// Enhanced broadcast refresh that includes departments
export async function broadcastRefresh() {
  if (!wss || clients.size === 0) return;

  try {
    const { analysisService } = await import('../services/analysisService.js');
    const [analyses, departments] = await Promise.all([
      analysisService.getAllAnalyses(),
      departmentService.getAllDepartments(),
    ]);

    const message = JSON.stringify({
      type: 'init',
      analyses,
      departments,
      version: '2.0',
    });

    clients.forEach((client) => {
      if (client.readyState === client.OPEN) {
        try {
          client.send(message);
        } catch (error) {
          console.error(`Error sending refresh:`, error.message);
          clients.delete(client);
        }
      }
    });
  } catch (error) {
    console.error('Error broadcasting refresh:', error);
  }
}

// Helper function to send status update to a specific client
async function sendStatusUpdate(client) {
  try {
    const { analysisService } = await import('../services/analysisService.js');
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    const ms = (await import('ms')).default;

    // Get container state
    const containerState = getContainerState();

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
      type: 'statusUpdate',
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

    if (client.readyState === client.OPEN) {
      client.send(JSON.stringify(status));
    }
  } catch (error) {
    console.error(`Error sending status update:`, error);
  }
}

// Container state management (should be injected from server.js)
let containerState = {
  status: 'ready',
  startTime: new Date(),
  message: 'Container is ready',
};

export function setContainerState(state) {
  containerState = state;
}

export function getContainerState() {
  return containerState;
}

// Enhanced broadcast functions for department operations
export function broadcastDepartmentUpdate(department, action) {
  broadcast({
    type: 'departmentUpdate',
    action,
    department,
    timestamp: new Date().toISOString(),
  });
}

export function broadcastAnalysisMove(analysisName, fromDept, toDept) {
  broadcast({
    type: 'analysisMovedToDepartment',
    analysis: analysisName,
    from: fromDept,
    to: toDept,
    timestamp: new Date().toISOString(),
  });
}

export function broadcastUpdate(type, data) {
  if (type === 'log') {
    broadcast({
      type: 'log',
      data: data,
    });
  } else {
    // For other update types, use the original structure
    broadcast({
      type: 'analysisUpdate',
      analysisName: type,
      update: data,
      timestamp: new Date().toISOString(),
    });
  }
}

export function broadcastStatusUpdate() {
  if (!wss || clients.size === 0) return;

  clients.forEach(async (client) => {
    if (client.readyState === client.OPEN) {
      await sendStatusUpdate(client);
    }
  });
}

export function updateContainerState(newState) {
  containerState = { ...containerState, ...newState };
  // Broadcast status update when container state changes
  broadcastStatusUpdate();
}

// Cleanup function
export function closeWebSocket() {
  if (wss) {
    clients.forEach((client) => {
      client.close();
    });
    clients.clear();
    wss.close();
    wss = null;
    console.log('WebSocket server closed');
  }
}
