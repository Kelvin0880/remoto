// Servidor de señalización de Remoto.
// Solo empareja a dos clientes por un código de sala y reenvía offer/answer/ICE.
// El video y el control remoto viajan directo entre los dos peers (WebRTC P2P) — este
// servidor nunca ve ese tráfico.
const http = require('http');
const { WebSocketServer } = require('ws');
const { RoomManager } = require('./roomManager');
const { handleMessage, handleClose } = require('./messageHandlers');

const PORT = process.env.PORT || 8787;

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Remoto signaling server OK');
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server });
const rooms = new RoomManager();

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      rooms.safeSend(ws, { type: 'error', reason: 'bad-json' });
      return;
    }
    handleMessage(ws, msg, rooms);
  });

  ws.on('close', () => handleClose(ws, rooms));
});

// Keepalive: descarta sockets muertos y evita que proxies intermedios corten la conexión
// por inactividad.
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => clearInterval(interval));

server.listen(PORT, () => {
  console.log(`Remoto signaling server escuchando en el puerto ${PORT}`);
});
