const crypto = require('crypto');

// Sin 0/O/1/I/l para que un código leído en voz alta no genere confusión.
const CODE_CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const ROOM_TTL_MS = 10 * 60 * 1000; // una sala sin reclamar expira a los 10 minutos

function generateCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARSET[crypto.randomInt(CODE_CHARSET.length)];
  }
  return code;
}

class RoomManager {
  constructor() {
    this.rooms = new Map(); // code -> room
    this.byWs = new Map(); // ws -> { code, role }
  }

  createRoom(hostWs) {
    let code;
    do {
      code = generateCode();
    } while (this.rooms.has(code));

    const room = {
      code,
      hostWs,
      peerWs: null,
      peerName: null,
      state: 'waiting', // waiting -> pending-consent -> connecting -> connected
      createdAt: Date.now(),
      expireTimer: setTimeout(() => this.expireRoom(code), ROOM_TTL_MS),
    };
    this.rooms.set(code, room);
    this.byWs.set(hostWs, { code, role: 'host' });
    return room;
  }

  expireRoom(code) {
    const room = this.rooms.get(code);
    if (!room || room.state === 'connected') return; // ya en sesión, no expira sola
    this.safeSend(room.hostWs, { type: 'error', reason: 'expired' });
    this.safeSend(room.peerWs, { type: 'error', reason: 'expired' });
    this.destroyRoom(code);
  }

  getRoom(code) {
    return this.rooms.get(code);
  }

  joinRoom(code, peerWs, displayName) {
    const room = this.rooms.get(code);
    if (!room) return { error: 'not-found' };
    if (room.peerWs) return { error: 'room-full' };

    clearTimeout(room.expireTimer);
    room.peerWs = peerWs;
    room.peerName = String(displayName || 'Alguien').slice(0, 40);
    room.state = 'pending-consent';
    this.byWs.set(peerWs, { code, role: 'peer' });
    return { room };
  }

  destroyRoom(code) {
    const room = this.rooms.get(code);
    if (!room) return;
    clearTimeout(room.expireTimer);
    this.byWs.delete(room.hostWs);
    if (room.peerWs) this.byWs.delete(room.peerWs);
    this.rooms.delete(code);
  }

  roleOf(ws) {
    return this.byWs.get(ws);
  }

  safeSend(ws, payload) {
    if (!ws || ws.readyState !== ws.OPEN) return;
    ws.send(JSON.stringify(payload));
  }
}

module.exports = { RoomManager, generateCode };
