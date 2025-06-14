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
      }
    } catch (error) {
      console.error('Error sending initial state:', error);
    }

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

export { setupWebSocket, broadcastUpdate, broadcastRefresh };
