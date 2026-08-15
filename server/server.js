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
    if (!msg || typeof msg.type !== 'string') {
      rooms.safeSend(ws, { type: 'error', reason: 'bad-message' });
      return;
    }
    // Un mensaje con forma inesperada de un cliente no debe poder tirar abajo el
    // servicio para todos los demás.
    try {
      handleMessage(ws, msg, rooms);
    } catch (err) {
      console.error('Error manejando mensaje:', err);
      rooms.safeSend(ws, { type: 'error', reason: 'internal-error' });
    }
  });

  ws.on('error', (err) => {
    console.error('Error de socket:', err.message);
  });

  ws.on('close', () => {
    try {
      handleClose(ws, rooms);
    } catch (err) {
      console.error('Error en cleanup de cierre:', err);
    }
  });
});

// Evita que un error no capturado en cualquier parte tumbe todo el proceso — se loguea
// y el servicio sigue en pie para las demás sesiones activas.
process.on('uncaughtException', (err) => console.error('uncaughtException:', err));
process.on('unhandledRejection', (err) => console.error('unhandledRejection:', err));

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
