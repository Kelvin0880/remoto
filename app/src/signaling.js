// Cliente WebSocket liviano para hablar con el servidor de señalización.
// Un solo handler por tipo de mensaje alcanza para el flujo de Remoto (cada sesión
// usa una instancia nueva). Distingue un cierre intencional (llamando a close()) de uno
// inesperado (servidor caído, red cortada) para que la UI pueda avisar cuando corresponde.
export function createSignaling(url, { connectTimeoutMs = 20000 } = {}) {
  const ws = new WebSocket(url);
  const handlers = new Map();
  let onUnexpectedClose = null;
  let intentionalClose = false;

  ws.addEventListener("message", (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return; // mensaje corrupto: se ignora en vez de romper la sesión
    }
    handlers.get(msg.type)?.(msg);
  });

  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("timeout"));
    }, connectTimeoutMs);

    ws.addEventListener(
      "open",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
    ws.addEventListener(
      "error",
      () => {
        clearTimeout(timer);
        reject(new Error("connection-error"));
      },
      { once: true },
    );
  });

  ws.addEventListener("close", () => {
    if (!intentionalClose) onUnexpectedClose?.();
  });

  return {
    ready,
    on(type, handler) {
      handlers.set(type, handler);
    },
    onUnexpectedClose(handler) {
      onUnexpectedClose = handler;
    },
    send(payload) {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
    },
    close() {
      intentionalClose = true;
      try {
        ws.close();
      } catch {
        /* ya estaba cerrado */
      }
    },
  };
}
