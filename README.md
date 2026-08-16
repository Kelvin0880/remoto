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

## Cómo usarla con tu amigo

1. Cada uno instala `Remoto_0.1.0_x64-setup.exe` (no hace falta ser administrador). Windows va
   a mostrar una advertencia de SmartScreen la primera vez por no estar firmado — "Más
   información → Ejecutar de todos modos".
2. Quien va a **compartir su pantalla** abre la app y toca **"Compartir mi pantalla"** — le
   aparece un código de 6 caracteres.
3. El otro toca **"Conectarme a un amigo"**, pone su nombre y ese código.
4. A quien comparte le aparece un cartel pidiendo aceptar o rechazar. Al aceptar, Windows pide
   elegir qué pantalla compartir — conviene elegir **"Pantalla completa"**.
5. Listo: video en vivo de un lado, control de mouse/teclado desde el otro. Cualquiera puede
   cortar la sesión en el momento que quiera.

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

## App de escritorio — desarrollo local

Requiere Rust + MSVC Build Tools instalados en la máquina de desarrollo (no en la del usuario
final, que solo instala el instalador ya compilado).

```bash
cd app
npm install
npx tauri dev       # modo desarrollo, recarga en caliente
npx tauri build      # genera el instalador final en src-tauri/target/release/bundle/nsis
```

Instalador final: **~1.1 MB** · ejecutable: **~3.1 MB** · ~30 MB de RAM en uso.

## Publicar `.apk` y `.exe` (modo simple)

Este repo quedó configurado para que solo tengas que arrastrar tus binarios a
`/home/runner/work/remoto/remoto/releases/` y hacer push.

Flujo:

1. Copia tu `.apk` y/o `.exe` dentro de `releases/`.
2. Haz commit y push.
3. GitHub Actions ejecuta automáticamente el workflow
   `.github/workflows/publish-binaries.yml`.
4. Se crea/actualiza un Release automático del día y se adjuntan los archivos
   como assets.

Notas:

- El Release se etiqueta como `assets-YYYY.MM.DD`.
- Si subes más binarios el mismo día, se agregan al mismo Release.
- Si quieres evitar crecer el historial del repo con binarios, usa GitHub
  Releases manualmente (arrastrando los archivos en la UI del Release) o Git
  LFS.

## Limitaciones conocidas (v1)

- Solo Windows por ahora.
- Sin servidor TURN: si alguno de los dos está detrás de una red con NAT muy estricta
  (típico de algunas redes corporativas), la conexión directa puede fallar.
- No se puede controlar una ventana que el otro lado tiene abierta "como administrador"
  (protección UIPI de Windows) salvo que Remoto también corra como administrador.
- El instalador no está firmado digitalmente, así que Windows SmartScreen va a mostrar una
  advertencia la primera vez — es esperable, se resuelve con "Más información → Ejecutar de
  todos modos".
