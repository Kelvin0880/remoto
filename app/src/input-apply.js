// Lado del host: traduce los mensajes recibidos por el data channel en llamadas a los
// comandos de Rust que de verdad mueven el mouse / escriben en esta máquina.
const { invoke } = window.__TAURI__.core;

export function applyRemoteInput(msg) {
  switch (msg.t) {
    case "move":
      invoke("move_mouse", { x: msg.x, y: msg.y }).catch(() => {});
      break;
    case "click":
      invoke("mouse_click", { button: msg.button }).catch(() => {});
      break;
    case "scroll":
      invoke("mouse_scroll", { deltaY: msg.dy }).catch(() => {});
      break;
    case "text":
      invoke("type_text", { text: msg.value }).catch(() => {});
      break;
    case "key":
      invoke("key_press", { key: msg.value }).catch(() => {});
      break;
    default:
      break;
  }
}
