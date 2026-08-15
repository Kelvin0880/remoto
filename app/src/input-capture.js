// Lado del controlador: captura mouse/teclado sobre el <video> y los manda por el data
// channel escalados a la resolución real de la pantalla remota.
// v1: mouse (mover/click/scroll) + texto imprimible + algunas teclas con nombre
// (Enter/Backspace/Tab/flechas/Escape). Combinaciones con Ctrl/Alt quedan para más adelante.
export function attachInputCapture(videoEl, sendFn, getRemoteSize) {
  const controller = new AbortController();
  const { signal } = controller;
  videoEl.tabIndex = 0;

  function scaledCoords(e) {
    const rect = videoEl.getBoundingClientRect();
    const { w, h } = getRemoteSize();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * w);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * h);
    return { x: Math.max(0, x), y: Math.max(0, y) };
  }

  videoEl.addEventListener(
    "mousemove",
    (e) => sendFn({ t: "move", ...scaledCoords(e) }),
    { signal },
  );

  videoEl.addEventListener(
    "mousedown",
    (e) => {
      e.preventDefault();
      videoEl.focus();
      sendFn({ t: "click", button: ["left", "middle", "right"][e.button] || "left" });
    },
    { signal },
  );

  videoEl.addEventListener("contextmenu", (e) => e.preventDefault(), { signal });

  videoEl.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      sendFn({ t: "scroll", dy: Math.sign(e.deltaY) * 3 });
    },
    { signal, passive: false },
  );

  const namedKeys = new Set([
    "Enter", "Backspace", "Tab", "Escape", "Delete",
    "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  ]);

  videoEl.addEventListener(
    "keydown",
    (e) => {
      e.preventDefault();
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        sendFn({ t: "text", value: e.key });
      } else if (e.key === " ") {
        sendFn({ t: "text", value: " " });
      } else if (namedKeys.has(e.key)) {
        sendFn({ t: "key", value: e.key });
      }
    },
    { signal },
  );

  return () => controller.abort();
}
