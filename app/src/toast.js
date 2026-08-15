// Notificaciones no bloqueantes (reemplazan los alert(), que congelan la ventana y se ven mal).
export function showToast(message, { type = "error", duration = 5000 } = {}) {
  const container = document.getElementById("toast-container");
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.textContent = message;
  container.appendChild(el);

  requestAnimationFrame(() => el.classList.add("show"));

  let dismissed = false;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    el.classList.remove("show");
    setTimeout(() => el.remove(), 250);
  };

  el.addEventListener("click", dismiss);
  if (duration > 0) setTimeout(dismiss, duration);

  return { dismiss };
}
