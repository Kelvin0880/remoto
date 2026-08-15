// Envoltorio fino sobre RTCPeerConnection. El video y los datos viajan P2P entre los dos
// peers — este módulo no habla con el servidor de señalización directamente, solo expone
// los eventos que main.js necesita reenviar por señalización.
const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];
// v1 sin TURN: si alguno de los dos está detrás de NAT muy estricta, esto puede no conectar.

export function createPeerConnection({ onTrack, onDataChannel, onIceCandidate, onConnectionStateChange }) {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  pc.addEventListener("track", (event) => onTrack?.(event.streams[0]));
  pc.addEventListener("icecandidate", (event) => {
    if (event.candidate) onIceCandidate?.(event.candidate);
  });
  pc.addEventListener("datachannel", (event) => onDataChannel?.(event.channel));
  pc.addEventListener("connectionstatechange", () => onConnectionStateChange?.(pc.connectionState));

  return pc;
}
