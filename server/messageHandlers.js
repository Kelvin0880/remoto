// Máquina de mensajes del protocolo de señalización. Ver README para el detalle de cada tipo.
function handleMessage(ws, msg, rooms) {
  switch (msg.type) {
    case 'create-room': {
      const room = rooms.createRoom(ws);
      rooms.safeSend(ws, { type: 'room-created', code: room.code, expiresInSec: 600 });
      break;
    }

    case 'join-room': {
      const code = String(msg.code || '').toUpperCase();
      const result = rooms.joinRoom(code, ws, msg.displayName);
      if (result.error) {
        rooms.safeSend(ws, { type: 'error', reason: result.error });
        return;
      }
      rooms.safeSend(ws, { type: 'joined', code: result.room.code });
      // Dispara el modal de consentimiento del lado del host — todavía no arranca nada de WebRTC.
      rooms.safeSend(result.room.hostWs, { type: 'peer-joined', displayName: result.room.peerName });
      break;
    }

    case 'accept': {
      const info = rooms.roleOf(ws);
      if (!info || info.role !== 'host') return;
      const room = rooms.getRoom(info.code);
      if (!room) return;
      room.state = 'connecting';
      rooms.safeSend(room.peerWs, { type: 'accepted' });
      break;
    }

    case 'decline': {
      const info = rooms.roleOf(ws);
      if (!info || info.role !== 'host') return;
      const room = rooms.getRoom(info.code);
      if (!room) return;
      rooms.safeSend(room.peerWs, { type: 'declined' });
      rooms.destroyRoom(info.code);
      break;
    }

    // Relay puro de la negociación WebRTC entre los dos peers.
    case 'offer':
    case 'answer':
    case 'ice-candidate': {
      const info = rooms.roleOf(ws);
      if (!info) return;
      const room = rooms.getRoom(info.code);
      if (!room) return;
      const target = info.role === 'host' ? room.peerWs : room.hostWs;
      rooms.safeSend(target, msg);
      if (msg.type === 'answer') room.state = 'connected';
      break;
    }

    case 'end-session': {
      const info = rooms.roleOf(ws);
      if (!info) return;
      const room = rooms.getRoom(info.code);
      if (!room) return;
      const other = info.role === 'host' ? room.peerWs : room.hostWs;
      rooms.safeSend(other, { type: 'peer-left' });
      rooms.destroyRoom(info.code);
      break;
    }

    default:
      rooms.safeSend(ws, { type: 'error', reason: 'unknown-type' });
  }
}

function handleClose(ws, rooms) {
  const info = rooms.roleOf(ws);
  if (!info) return;
  const room = rooms.getRoom(info.code);
  if (!room) return;
  const other = info.role === 'host' ? room.peerWs : room.hostWs;
  rooms.safeSend(other, { type: 'peer-left' });
  rooms.destroyRoom(info.code);
}

module.exports = { handleMessage, handleClose };
