// Cliente WebSocket liviano para hablar con el servidor de señalización.
// Un solo handler por tipo de mensaje alcanza para el flujo de Remoto (cada sesión
// usa una instancia nueva).
export function createSignaling(url) {
  const ws = new WebSocket(url);
  const handlers = new Map();

  ws.addEventListener("message", (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }
    handlers.get(msg.type)?.(msg);
  });

  const ready = new Promise((resolve, reject) => {
    ws.addEventListener("open", () => resolve(), { once: true });
    ws.addEventListener(
      "error",
      () => reject(new Error("No se pudo conectar al servidor de señalización")),
      { once: true },
    );
  });

  return {
    ready,
    on(type, handler) {
      handlers.set(type, handler);
    },
    send(payload) {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
    },
    close() {
      try {
        ws.close();
      } catch {
        /* ya cerrado */
      }
    },
  };
}
