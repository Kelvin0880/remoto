// Controlador principal de la app: máquina de estados de las pantallas + orquesta
// señalización, WebRTC e input remoto. Sin framework — DOM plano a propósito.
import { createSignaling } from "./signaling.js";
import { createPeerConnection } from "./webrtc.js";
import { attachInputCapture } from "./input-capture.js";
import { applyRemoteInput } from "./input-apply.js";
import { showToast } from "./toast.js";

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

function setBusy(button, busy) {
  button.disabled = busy;
}

const CONNECTION_STATE_MESSAGES = {
  failed: "No se pudo establecer conexión directa. Puede ser un firewall o una red muy restrictiva de alguno de los dos lados.",
  disconnected: "Se perdió la conexión con tu amigo.",
};

// ---------- estado de la sesión activa ----------
let signaling = null;
let pc = null;
let dataChannel = null;
let remoteSize = { w: 1920, h: 1080 };
let detachInput = null;
let sessionEnded = false; // evita procesar eventos tardíos después de cortar/resetear

function resetState() {
  sessionEnded = true;
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
const btnHost = document.getElementById("btn-host");
btnHost.addEventListener("click", startHosting);
document.getElementById("btn-host-cancel").addEventListener("click", () => {
  signaling?.close();
  resetState();
});
document.getElementById("btn-host-stop").addEventListener("click", () => {
  signaling?.send({ type: "end-session" });
  resetState();
});
document.getElementById("btn-copy-code").addEventListener("click", async () => {
  const code = document.getElementById("host-code").textContent;
  try {
    await navigator.clipboard.writeText(code);
    showToast("Código copiado", { type: "success", duration: 2000 });
  } catch {
    showToast("No se pudo copiar automáticamente — seleccionalo a mano.", { duration: 3000 });
  }
});

async function startHosting() {
  sessionEnded = false;
  setBusy(btnHost, true);
  signaling = createSignaling(SIGNAL_URL);

  try {
    await signaling.ready;
  } catch {
    showToast("No se pudo conectar al servidor. Puede tardar unos segundos la primera vez si estaba dormido — probá de nuevo.");
    signaling = null;
    setBusy(btnHost, false);
    return;
  }
  setBusy(btnHost, false);

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
    const messages = { expired: "El código expiró sin que nadie se conectara." };
    showToast(messages[msg.reason] || `Error del servidor (${msg.reason}).`);
    resetState();
  });

  signaling.on("peer-left", () => {
    if (views.hostConnected.classList.contains("active")) {
      showToast("Tu amigo se desconectó.", { type: "info" });
    }
    resetState();
  });

  signaling.onUnexpectedClose(() => {
    if (sessionEnded) return;
    showToast("Se perdió la conexión con el servidor.");
    resetState();
  });
}

async function beginHostWebRTC(peerName) {
  let stream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  } catch (err) {
    if (err.name === "NotAllowedError") {
      showToast("Cancelaste la selección de pantalla — sin eso no se puede compartir nada.");
    } else {
      showToast("No se pudo iniciar la captura de pantalla: " + err.message);
    }
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
      if (sessionEnded) return;
      if (state === "connected") {
        document.getElementById("host-connected-text").textContent = `Compartiendo tu pantalla con ${peerName}`;
        showView("hostConnected");
      }
      if (CONNECTION_STATE_MESSAGES[state]) {
        showToast(CONNECTION_STATE_MESSAGES[state]);
        resetState();
      }
    },
  });

  stream.getTracks().forEach((t) => pc.addTrack(t, stream));

  dataChannel = pc.createDataChannel("input");
  dataChannel.addEventListener("message", (e) => {
    try {
      applyRemoteInput(JSON.parse(e.data));
    } catch {
      /* mensaje de input corrupto: se ignora, no vale la pena cortar la sesión por esto */
    }
  });

  signaling.on("answer", async (msg) => {
    try {
      await pc.setRemoteDescription({ type: "answer", sdp: msg.sdp });
    } catch {
      showToast("No se pudo completar la conexión con tu amigo.");
      resetState();
    }
  });
  signaling.on("ice-candidate", (msg) => {
    pc.addIceCandidate(msg.candidate).catch(() => {});
  });

  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    signaling.send({ type: "offer", sdp: offer.sdp });
  } catch {
    showToast("No se pudo iniciar la conexión de video.");
    resetState();
    return;
  }

  // Si el usuario corta la compartición desde el picker nativo de Windows en vez de
  // usar nuestro botón, terminamos la sesión igual.
  track.addEventListener("ended", () => {
    if (sessionEnded) return;
    signaling.send({ type: "end-session" });
    resetState();
  });
}

// ================= GUEST: conectarme a un amigo =================
document.getElementById("btn-join").addEventListener("click", () => showView("joinForm"));
document.getElementById("btn-join-cancel").addEventListener("click", () => {
  signaling?.close();
  resetState();
});
document.getElementById("btn-join-cancel-2").addEventListener("click", () => {
  signaling?.send({ type: "end-session" });
  resetState();
});
document.getElementById("btn-join-stop").addEventListener("click", () => {
  signaling?.send({ type: "end-session" });
  resetState();
});

const btnJoinSubmit = document.getElementById("btn-join-submit");
btnJoinSubmit.addEventListener("click", startJoining);
document.getElementById("join-code").addEventListener("keydown", (e) => {
  if (e.key === "Enter") startJoining();
});

async function startJoining() {
  const name = document.getElementById("join-name").value.trim() || "Alguien";
  const code = document.getElementById("join-code").value.trim().toUpperCase();
  const errorEl = document.getElementById("join-error");
  errorEl.textContent = "";

  if (!code) {
    errorEl.textContent = "Ingresá el código que te compartieron.";
    return;
  }

  sessionEnded = false;
  setBusy(btnJoinSubmit, true);
  signaling = createSignaling(SIGNAL_URL);

  try {
    await signaling.ready;
  } catch {
    errorEl.textContent = "No se pudo conectar al servidor. Puede tardar unos segundos la primera vez — probá de nuevo.";
    signaling = null;
    setBusy(btnJoinSubmit, false);
    return;
  }
  setBusy(btnJoinSubmit, false);

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

  signaling.onUnexpectedClose(() => {
    if (sessionEnded) return;
    showToast("Se perdió la conexión con el servidor.");
    resetState();
  });
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
      if (sessionEnded) return;
      if (CONNECTION_STATE_MESSAGES[state]) {
        showToast(CONNECTION_STATE_MESSAGES[state]);
        resetState();
      }
    },
  });

  signaling.on("offer", async (msg) => {
    try {
      await pc.setRemoteDescription({ type: "offer", sdp: msg.sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      signaling.send({ type: "answer", sdp: answer.sdp });
    } catch {
      showToast("No se pudo completar la conexión con tu amigo.");
      resetState();
    }
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

// Si algo revienta en un handler async que no estamos cubriendo explícitamente, que se
// vea en consola en vez de dejar la app en un estado colgado sin ninguna pista.
window.addEventListener("unhandledrejection", (e) => {
  console.error("Promesa sin manejar:", e.reason);
});
