// Pantalla de diagnóstico: valida getDisplayMedia() (captura de pantalla vía WebRTC/Chromium)
// y el comando Rust move_mouse (control de mouse vía enigo) antes de construir la app real.
const { invoke } = window.__TAURI__.core;

const captureBtn = document.getElementById("btn-capture");
const preview = document.getElementById("preview");

captureBtn.addEventListener("click", async () => {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    preview.srcObject = stream;
  } catch (err) {
    alert("Error capturando pantalla: " + err.message);
  }
});

const mouseBtn = document.getElementById("btn-mouse");
const mouseResult = document.getElementById("mouse-result");

mouseBtn.addEventListener("click", async () => {
  try {
    await invoke("move_mouse", { x: 200, y: 200 });
    mouseResult.textContent = "OK — revisá si el mouse se movió a (200, 200).";
  } catch (err) {
    mouseResult.textContent = "Error: " + err;
  }
});
