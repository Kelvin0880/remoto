// Controlador principal de la app: máquina de estados de las pantallas + orquesta
// señalización, WebRTC e input remoto. Sin framework — DOM plano a propósito.
import { createSignaling } from "./signaling.js";
import { createPeerConnection } from "./webrtc.js";
import { attachInputCapture } from "./input-capture.js";
import { applyRemoteInput } from "./input-apply.js";

const SIGNAL_URL = "wss://remoto-signal.onrender.com";

const views = {
  home: document.getElementById("view-home"),
  hostWaiting: document.getElementById("view-host-waiting"),
  hostConnected: document.getElementById("view-host-connected"),
  joinForm: document.getElementById("view-join-form"),
  joinWaiting: document.getElementById("view-join-waiting"),
  joinConnected: document.getElementById("view-join-connected"),
};

function showView(name) {
  for (const v of Object.values(views)) v.classList.remove("active");
  views[name].classList.add("active");
}

// ---------- estado de la sesión activa ----------
let signaling = null;
let pc = null;
let dataChannel = null;
let remoteSize = { w: 1920, h: 1080 };
let detachInput = null;

function resetState() {
  detachInput?.();
  detachInput = null;
  dataChannel?.close();
  pc?.close();
  signaling?.close();
  signaling = null;
  pc = null;
  dataChannel = null;
  document.getElementById("join-error").textContent = "";
  showView("home");
}

// ================= HOST: compartir mi pantalla =================
document.getElementById("btn-host").addEventListener("click", startHosting);
document.getElementById("btn-host-cancel").addEventListener("click", resetState);
document.getElementById("btn-host-stop").addEventListener("click", () => {
  signaling?.send({ type: "end-session" });
  resetState();
});

async function startHosting() {
  signaling = createSignaling(SIGNAL_URL);
  try {
    await signaling.ready;
  } catch {
    alert("No se pudo conectar al servidor. Revisá tu conexión a internet.");
    signaling = null;
    return;
  }

  showView("hostWaiting");
  document.getElementById("host-code").textContent = "------";
  signaling.send({ type: "create-room" });

  signaling.on("room-created", (msg) => {
    document.getElementById("host-code").textContent = msg.code;
  });

  // Nada de captura ni de WebRTC arranca antes de este punto: el consentimiento es
  // explícito y previo a cualquier dato compartido.
  signaling.on("peer-joined", (msg) => {
    showConsentModal(msg.displayName, {
      onAccept: () => {
        signaling.send({ type: "accept" });
        beginHostWebRTC(msg.displayName);
      },
      onDecline: () => signaling.send({ type: "decline" }),
    });
  });

  signaling.on("error", (msg) => {
    alert("Error del servidor: " + msg.reason);
    resetState();
  });

  signaling.on("peer-left", () => {
    if (views.hostConnected.classList.contains("active")) alert("Tu amigo se desconectó.");
    resetState();
  });
}

async function beginHostWebRTC(peerName) {
  let stream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  } catch {
    alert("Cancelaste la selección de pantalla — sin eso no se puede compartir nada.");
    signaling.send({ type: "end-session" });
    resetState();
    return;
  }

  const track = stream.getVideoTracks()[0];
  const settings = track.getSettings();
  remoteSize = { w: settings.width || 1920, h: settings.height || 1080 };

  pc = createPeerConnection({
    onIceCandidate: (candidate) => signaling.send({ type: "ice-candidate", candidate }),
    onConnectionStateChange: (state) => {
      if (state === "connected") {
        document.getElementById("host-connected-text").textContent = `Compartiendo tu pantalla con ${peerName}`;
        showView("hostConnected");
      }
      if (state === "failed" || state === "disconnected") resetState();
    },
  });

  stream.getTracks().forEach((t) => pc.addTrack(t, stream));

  dataChannel = pc.createDataChannel("input");
  dataChannel.addEventListener("message", (e) => applyRemoteInput(JSON.parse(e.data)));

  signaling.on("answer", async (msg) => {
    await pc.setRemoteDescription({ type: "answer", sdp: msg.sdp });
  });
  signaling.on("ice-candidate", (msg) => {
    pc.addIceCandidate(msg.candidate).catch(() => {});
  });

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  signaling.send({ type: "offer", sdp: offer.sdp });

  // Si el usuario corta la compartición desde el picker nativo de Windows en vez de
  // usar nuestro botón, terminamos la sesión igual.
  track.addEventListener("ended", () => {
    signaling.send({ type: "end-session" });
    resetState();
  });
}

// ================= GUEST: conectarme a un amigo =================
document.getElementById("btn-join").addEventListener("click", () => showView("joinForm"));
document.getElementById("btn-join-cancel").addEventListener("click", resetState);
document.getElementById("btn-join-cancel-2").addEventListener("click", () => {
  signaling?.send({ type: "end-session" });
  resetState();
});
document.getElementById("btn-join-stop").addEventListener("click", () => {
  signaling?.send({ type: "end-session" });
  resetState();
});
document.getElementById("btn-join-submit").addEventListener("click", startJoining);

async function startJoining() {
  const name = document.getElementById("join-name").value.trim() || "Alguien";
  const code = document.getElementById("join-code").value.trim().toUpperCase();
  const errorEl = document.getElementById("join-error");
  errorEl.textContent = "";

  if (!code) {
    errorEl.textContent = "Ingresá el código que te compartieron.";
    return;
  }

  signaling = createSignaling(SIGNAL_URL);
  try {
    await signaling.ready;
  } catch {
    errorEl.textContent = "No se pudo conectar al servidor.";
    signaling = null;
    return;
  }

  signaling.send({ type: "join-room", code, displayName: name });
  document.getElementById("join-waiting-text").textContent = "Esperando que tu amigo acepte…";
  showView("joinWaiting");

  signaling.on("error", (msg) => {
    const messages = {
      "not-found": "Ese código no existe o ya expiró.",
      "room-full": "Esa sala ya tiene a alguien conectado.",
      expired: "El código expiró.",
    };
    showView("joinForm");
    errorEl.textContent = messages[msg.reason] || "Ocurrió un error.";
    signaling?.close();
    signaling = null;
  });

  signaling.on("declined", () => {
    showView("joinForm");
    errorEl.textContent = "Tu amigo rechazó la conexión.";
    signaling?.close();
    signaling = null;
  });

  signaling.on("accepted", beginGuestWebRTC);

  signaling.on("peer-left", () => resetState());
}

async function beginGuestWebRTC() {
  document.getElementById("join-waiting-text").textContent = "Conectando…";

  pc = createPeerConnection({
    onIceCandidate: (candidate) => signaling.send({ type: "ice-candidate", candidate }),
    onTrack: (stream) => {
      const video = document.getElementById("remote-video");
      video.srcObject = stream;
      showView("joinConnected");
      detachInput = attachInputCapture(
        video,
        (payload) => {
          if (dataChannel?.readyState === "open") dataChannel.send(JSON.stringify(payload));
        },
        () => remoteSize,
      );
    },
    onDataChannel: (channel) => {
      dataChannel = channel;
    },
    onConnectionStateChange: (state) => {
      if (state === "failed" || state === "disconnected") resetState();
    },
  });

  signaling.on("offer", async (msg) => {
    await pc.setRemoteDescription({ type: "offer", sdp: msg.sdp });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    signaling.send({ type: "answer", sdp: answer.sdp });
  });
  signaling.on("ice-candidate", (msg) => {
    pc.addIceCandidate(msg.candidate).catch(() => {});
  });
}

// ================= Modal de consentimiento (lado host) =================
function showConsentModal(name, { onAccept, onDecline }) {
  const modal = document.getElementById("consent-modal");
  document.getElementById("consent-text").textContent = `${name} quiere ver y controlar tu pantalla`;
  modal.classList.remove("hidden");

  const acceptBtn = document.getElementById("btn-consent-accept");
  const declineBtn = document.getElementById("btn-consent-decline");

  const cleanup = () => {
    modal.classList.add("hidden");
    acceptBtn.removeEventListener("click", onAcceptClick);
    declineBtn.removeEventListener("click", onDeclineClick);
  };
  const onAcceptClick = () => {
    cleanup();
    onAccept();
  };
  const onDeclineClick = () => {
    cleanup();
    onDecline();
  };

  acceptBtn.addEventListener("click", onAcceptClick);
  declineBtn.addEventListener("click", onDeclineClick);
}
