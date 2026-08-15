package com.kelvingomez.remoto.host

import android.accessibilityservice.AccessibilityServiceInfo
import android.app.AlertDialog
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.view.accessibility.AccessibilityManager
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import com.kelvingomez.remoto.host.capture.ScreenShareService
import com.kelvingomez.remoto.host.input.RemoteInputAccessibilityService
import com.kelvingomez.remoto.host.session.RemoteSession
import com.kelvingomez.remoto.host.signaling.SignalingClient
import com.kelvingomez.remoto.host.util.ScreenSize
import org.json.JSONObject
import org.webrtc.IceCandidate
import org.webrtc.PeerConnection

/**
 * Única Activity de la app. Orquesta: conexión de señalización, código de sala, modal de
 * consentimiento, permiso de MediaProjection, y arranque/parada del ScreenShareService.
 * Equivalente en Android al home/host de app/src/main.js.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var accessibilityStatus: TextView
    private lateinit var btnShare: Button
    private lateinit var codeText: TextView
    private lateinit var statusText: TextView
    private lateinit var btnStop: Button

    private var pendingPeerName: String = ""

    private val projectionLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) { result ->
        val data = result.data
        if (result.resultCode != RESULT_OK || data == null) {
            Toast.makeText(
                this,
                "Cancelaste compartir pantalla — sin eso no se puede compartir nada.",
                Toast.LENGTH_LONG,
            ).show()
            RemoteSession.signaling?.send(JSONObject().put("type", "end-session"))
            resetUi()
            return@registerForActivityResult
        }
        val size = ScreenSize.get(this)
        val serviceIntent = Intent(this, ScreenShareService::class.java).apply {
            putExtra(ScreenShareService.EXTRA_PROJECTION_DATA, data)
            putExtra(ScreenShareService.EXTRA_WIDTH, size.x)
            putExtra(ScreenShareService.EXTRA_HEIGHT, size.y)
        }
        startForegroundService(serviceIntent)
        statusText.text = "Conectando…"
        statusText.visibility = View.VISIBLE
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        accessibilityStatus = findViewById(R.id.accessibilityStatus)
        btnShare = findViewById(R.id.btnShare)
        codeText = findViewById(R.id.codeText)
        statusText = findViewById(R.id.statusText)
        btnStop = findViewById(R.id.btnStop)

        btnShare.setOnClickListener { startHosting() }
        btnStop.setOnClickListener {
            RemoteSession.signaling?.send(JSONObject().put("type", "end-session"))
            stopService(Intent(this, ScreenShareService::class.java))
            resetUi()
        }

        RemoteSession.onConnectionStateChanged = { state ->
            runOnUiThread { onConnectionState(state) }
        }
    }

    override fun onResume() {
        super.onResume()
        refreshAccessibilityStatus()
    }

    private fun onConnectionState(state: PeerConnection.PeerConnectionState) {
        when (state) {
            PeerConnection.PeerConnectionState.CONNECTED -> {
                statusText.text = "Compartiendo tu pantalla con $pendingPeerName"
                statusText.visibility = View.VISIBLE
                btnStop.visibility = View.VISIBLE
                codeText.visibility = View.GONE
                btnShare.visibility = View.GONE
            }
            PeerConnection.PeerConnectionState.FAILED,
            PeerConnection.PeerConnectionState.DISCONNECTED,
            PeerConnection.PeerConnectionState.CLOSED,
            -> {
                Toast.makeText(this, "Se cortó la conexión.", Toast.LENGTH_SHORT).show()
                resetUi()
            }
            else -> Unit
        }
    }

    private fun refreshAccessibilityStatus() {
        if (isAccessibilityServiceEnabled()) {
            accessibilityStatus.visibility = View.GONE
        } else {
            accessibilityStatus.text = "Para que tu amigo pueda tocar y escribir en este " +
                "teléfono hace falta habilitar el servicio de Accesibilidad de Remoto. " +
                "Tocá acá para ir a Ajustes."
            accessibilityStatus.visibility = View.VISIBLE
            accessibilityStatus.setOnClickListener {
                startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
            }
        }
    }

    private fun isAccessibilityServiceEnabled(): Boolean {
        if (RemoteInputAccessibilityService.isConnected) return true
        val manager = getSystemService(ACCESSIBILITY_SERVICE) as AccessibilityManager
        val enabledServices =
            manager.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_GENERIC)
        return enabledServices.any { it.resolveInfo.serviceInfo.packageName == packageName }
    }

    private fun startHosting() {
        val signaling = SignalingClient(
            url = RemoteSession.SIGNAL_URL,
            onOpen = { RemoteSession.signaling?.send(JSONObject().put("type", "create-room")) },
            onMessage = { msg -> handleSignalingMessage(msg) },
            onUnexpectedClose = {
                Toast.makeText(this, "Se perdió la conexión con el servidor.", Toast.LENGTH_SHORT).show()
                resetUi()
            },
            onConnectError = {
                Toast.makeText(
                    this,
                    "No se pudo conectar al servidor. Puede tardar unos segundos la primera vez — probá de nuevo.",
                    Toast.LENGTH_LONG,
                ).show()
                resetUi()
            },
        )
        RemoteSession.signaling = signaling
        signaling.connect()
        btnShare.isEnabled = false
    }

    private fun handleSignalingMessage(msg: JSONObject) {
        when (msg.optString("type")) {
            "room-created" -> {
                codeText.text = msg.optString("code")
                codeText.visibility = View.VISIBLE
                statusText.text = "Esperando que tu amigo se conecte…"
                statusText.visibility = View.VISIBLE
            }
            "peer-joined" -> {
                pendingPeerName = msg.optString("displayName", "Alguien")
                showConsentDialog(pendingPeerName)
            }
            "answer" -> RemoteSession.webRtcHost?.setRemoteAnswer(msg.optString("sdp"))
            "ice-candidate" -> {
                val cand = msg.optJSONObject("candidate") ?: return
                RemoteSession.webRtcHost?.addRemoteIceCandidate(
                    IceCandidate(
                        cand.optString("sdpMid"),
                        cand.optInt("sdpMLineIndex"),
                        cand.optString("candidate"),
                    ),
                )
            }
            "peer-left" -> {
                Toast.makeText(this, "Tu amigo se desconectó.", Toast.LENGTH_SHORT).show()
                stopService(Intent(this, ScreenShareService::class.java))
                resetUi()
            }
            "error" -> {
                Toast.makeText(this, "Error del servidor: ${msg.optString("reason")}", Toast.LENGTH_LONG).show()
                resetUi()
            }
        }
    }

    private fun showConsentDialog(name: String) {
        AlertDialog.Builder(this)
            .setTitle("$name quiere conectarse")
            .setMessage("Va a poder ver y controlar tu pantalla hasta que cortes la sesión.")
            .setPositiveButton("Aceptar") { _, _ ->
                RemoteSession.peerName = name
                RemoteSession.signaling?.send(JSONObject().put("type", "accept"))
                requestScreenCapturePermission()
            }
            .setNegativeButton("Rechazar") { _, _ ->
                RemoteSession.signaling?.send(JSONObject().put("type", "decline"))
            }
            .setCancelable(false)
            .show()
    }

    private fun requestScreenCapturePermission() {
        val manager = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        projectionLauncher.launch(manager.createScreenCaptureIntent())
    }

    private fun resetUi() {
        RemoteSession.reset()
        codeText.visibility = View.GONE
        statusText.visibility = View.GONE
        btnStop.visibility = View.GONE
        btnShare.visibility = View.VISIBLE
        btnShare.isEnabled = true
        pendingPeerName = ""
    }
}
