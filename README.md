# Remoto

App de escritorio liviana (Windows) para conectarte con un amigo a distancia y ver/controlar
su pantalla con consentimiento explícito — pensada para ser simple, rápida y **no pesada**
(usa [Tauri](https://tauri.app), no Electron).

**Creador: Kelvin Gomez**

## Cómo funciona

- La app usa WebRTC (el mismo estándar que usan Meet/Zoom en el navegador) para el video de
  pantalla y el control remoto — la conexión es **directa entre las dos PCs**, no pasa por
  ningún servidor nuestro.
- Un pequeño servidor de señalización (`server/`) solo se encarga de **presentar** a los dos
  amigos mediante un código de 6 caracteres y desaparece una vez que quedan conectados. Vive
  desplegado en [Render](https://render.com).
- Nada empieza a compartirse sin que la persona dueña de la pantalla **acepte explícitamente**
  una ventana de consentimiento.

## Estructura del proyecto

```
Remoto/
├── server/     servidor de señalización (Node.js + WebSocket) → se despliega en Render
└── app/        aplicación de escritorio (Tauri v2 + Rust + JS) → se instala en Windows
```

## Servidor de señalización — desarrollo local

```bash
cd server
npm install
npm start          # levanta en ws://localhost:8787
npm test           # prueba automatizada del protocolo completo (create/join/accept/relay)
```

## Despliegue del servidor (Render)

Ver `render.yaml` en la raíz — despliegue automatizado por API documentado en detalle cuando
se conecte la cuenta de Render (requiere un API key generado una única vez desde el dashboard,
paso que no se puede automatizar por completo).

## App de escritorio

En construcción — requiere Rust + MSVC Build Tools instalados en la máquina de desarrollo
(no en la del usuario final, que solo instala el `.exe`/instalador ya compilado).

## Limitaciones conocidas (v1)

- Solo Windows por ahora.
- Sin servidor TURN: si alguno de los dos está detrás de una red con NAT muy estricta
  (típico de algunas redes corporativas), la conexión directa puede fallar.
- No se puede controlar una ventana que el otro lado tiene abierta "como administrador"
  (protección UIPI de Windows) salvo que Remoto también corra como administrador.
- El instalador no está firmado digitalmente, así que Windows SmartScreen va a mostrar una
  advertencia la primera vez — es esperable, se resuelve con "Más información → Ejecutar de
  todos modos".
