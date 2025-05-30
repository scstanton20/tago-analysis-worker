// utils/websocketz.js
import { WebSocketServer } from 'ws';

let wss = null;
const clients = new Set();

function setupWebSocket(server) {
  // Ensure we don't create multiple WebSocket servers
  if (wss !== null) {
    console.warn('WebSocket server already exists');
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
      const { analysisService } = await import('../services/analysisService.js');
      const analyses = await analysisService.getRunningAnalyses();

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
      console.log('WebSocket connection closed');
      clients.delete(ws);
    });

    ws.on('error', (error) => {
      console.error('WebSocket connection error:', error);
      clients.delete(ws);
    });
  });

  return wss;
}

function broadcastUpdate(type, data) {
  // Add check to prevent unnecessary broadcasts
  if (!wss || clients.size === 0) return;

  const message = JSON.stringify({ type, data });

  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(message);
      } catch (error) {
        console.error('Error broadcasting to client:', error);
        clients.delete(client);
      }
    }
  });
}

export { setupWebSocket, broadcastUpdate };