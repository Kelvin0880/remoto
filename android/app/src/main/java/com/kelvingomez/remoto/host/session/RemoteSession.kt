package com.kelvingomez.remoto.host.session

import com.kelvingomez.remoto.host.input.InputMessage
import com.kelvingomez.remoto.host.signaling.SignalingClient
import com.kelvingomez.remoto.host.webrtc.WebRtcHost
import org.webrtc.PeerConnection

/**
 * Puente entre la Activity (UI), el foreground Service (captura + WebRTC) y el
 * AccessibilityService (input) — los tres componentes de Android tienen ciclos de vida
 * independientes, así que necesitan un punto en común para pasarse datos.
 */
object RemoteSession {
    const val SIGNAL_URL = "wss://remoto-signal.onrender.com"

    var signaling: SignalingClient? = null
    var webRtcHost: WebRtcHost? = null
    var inputHandler: ((InputMessage) -> Unit)? = null
    var onConnectionStateChanged: ((PeerConnection.PeerConnectionState) -> Unit)? = null
    var peerName: String = ""

    fun handleIncomingInput(raw: String) {
        val msg = InputMessage.parse(raw) ?: return
        inputHandler?.invoke(msg)
    }

    // Nota: inputHandler NO se limpia acá — lo controla el ciclo de vida del propio
    // AccessibilityService (que sigue vivo entre sesiones), no el de la sesión WebRTC.
    fun reset() {
        webRtcHost?.close()
        webRtcHost = null
        signaling?.close()
        signaling = null
        peerName = ""
    }
}
