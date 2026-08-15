// Prueba automatizada del protocolo de señalización end-to-end: simula un host y un peer
// reales conectados por WebSocket y verifica el flujo completo create -> join -> consentimiento
// -> relay de offer/answer/ICE -> end-session. No depende de un navegador ni de WebRTC real.
const WebSocket = require('ws');

const URL = process.env.TEST_URL || 'ws://localhost:8787';
const results = [];

function check(name, cond) {
  results.push({ name, ok: !!cond });
}

function next(ws) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout esperando mensaje (${ws._role})`)), 15000);
    ws.once('message', (raw) => {
      clearTimeout(timer);
      resolve(JSON.parse(raw.toString()));
    });
  });
}

async function run() {
  const host = new WebSocket(URL);
  host._role = 'host';
  const peer = new WebSocket(URL);
  peer._role = 'peer';

  await Promise.all([
    new Promise((r) => host.once('open', r)),
    new Promise((r) => peer.once('open', r)),
  ]);

  host.send(JSON.stringify({ type: 'create-room' }));
  const created = await next(host);
  check('room-created con código de 6 caracteres', created.type === 'room-created' && /^.{6}$/.test(created.code));

  peer.send(JSON.stringify({ type: 'join-room', code: created.code, displayName: 'Amigo' }));
  const joined = await next(peer);
  check('peer recibe joined', joined.type === 'joined' && joined.code === created.code);

  const peerJoined = await next(host);
  check('host recibe peer-joined (dispara consentimiento)', peerJoined.type === 'peer-joined' && peerJoined.displayName === 'Amigo');

  host.send(JSON.stringify({ type: 'accept' }));
  const accepted = await next(peer);
  check('peer recibe accepted', accepted.type === 'accepted');

  peer.send(JSON.stringify({ type: 'offer', sdp: 'FAKE_SDP_OFFER' }));
  const offerAtHost = await next(host);
  check('host recibe offer relayado', offerAtHost.type === 'offer' && offerAtHost.sdp === 'FAKE_SDP_OFFER');

  host.send(JSON.stringify({ type: 'answer', sdp: 'FAKE_SDP_ANSWER' }));
  const answerAtPeer = await next(peer);
  check('peer recibe answer relayado', answerAtPeer.type === 'answer' && answerAtPeer.sdp === 'FAKE_SDP_ANSWER');

  host.send(JSON.stringify({ type: 'ice-candidate', candidate: { fake: true } }));
  const iceAtPeer = await next(peer);
  check('peer recibe ice-candidate relayado', iceAtPeer.type === 'ice-candidate' && iceAtPeer.candidate.fake === true);

  host.send(JSON.stringify({ type: 'end-session' }));
  const peerLeft = await next(peer);
  check('end-session notifica peer-left', peerLeft.type === 'peer-left');

  host.close();
  peer.close();

  console.log('\nResultados:');
  for (const r of results) console.log(`  ${r.ok ? '✔' : '✘'} ${r.name}`);
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} pruebas pasaron.`);
  process.exit(passed === results.length ? 0 : 1);
}

run().catch((err) => {
  console.error('Error en la prueba:', err.message);
  process.exit(1);
});
