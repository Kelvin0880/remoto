package com.kelvingomez.remoto.host.capture

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.kelvingomez.remoto.host.MainActivity
import com.kelvingomez.remoto.host.R
import com.kelvingomez.remoto.host.session.RemoteSession
import com.kelvingomez.remoto.host.webrtc.WebRtcHost
import org.webrtc.EglBase
import org.webrtc.IceCandidate
import org.webrtc.PeerConnection
import org.webrtc.SessionDescription

/**
 * Foreground service dedicado a MediaProjection. Android exige este orden exacto desde
 * Android 14 (si no, SecurityException y crash): 1) la Activity ya obtuvo el Intent de
 * consentimiento, 2) ESTE servicio arranca en primer plano con el tipo mediaProjection
 * declarado ANTES de tocar la MediaProjection, 3) recién ahí se puede capturar.
 */
class ScreenShareService : Service() {

    private var eglBase: EglBase? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val projectionData = intent?.getParcelableExtra<Intent>(EXTRA_PROJECTION_DATA)
        val width = intent?.getIntExtra(EXTRA_WIDTH, 1080) ?: 1080
        val height = intent?.getIntExtra(EXTRA_HEIGHT, 1920) ?: 1920

        startForegroundWithNotification()

        if (projectionData == null) {
            stopSelf()
            return START_NOT_STICKY
        }

        val egl = EglBase.create()
        eglBase = egl

        val host = WebRtcHost(
            context = applicationContext,
            eglBase = egl,
            onIceCandidate = { candidate -> sendIceCandidate(candidate) },
            onLocalOffer = { desc -> sendOffer(desc) },
            onConnectionState = { state ->
                RemoteSession.onConnectionStateChanged?.invoke(state)
                if (state == PeerConnection.PeerConnectionState.FAILED ||
                    state == PeerConnection.PeerConnectionState.DISCONNECTED ||
                    state == PeerConnection.PeerConnectionState.CLOSED
                ) {
                    stopSelf()
                }
            },
        )
        RemoteSession.webRtcHost = host
        host.start(projectionData, width, height)

        return START_NOT_STICKY
    }

    private fun sendOffer(desc: SessionDescription) {
        val payload = org.json.JSONObject().apply {
            put("type", "offer")
            put("sdp", desc.description)
        }
        RemoteSession.signaling?.send(payload)
    }

    private fun sendIceCandidate(candidate: IceCandidate) {
        val cand = org.json.JSONObject().apply {
            put("candidate", candidate.sdp)
            put("sdpMid", candidate.sdpMid)
            put("sdpMLineIndex", candidate.sdpMLineIndex)
        }
        val payload = org.json.JSONObject().apply {
            put("type", "ice-candidate")
            put("candidate", cand)
        }
        RemoteSession.signaling?.send(payload)
    }

    private fun startForegroundWithNotification() {
        val channelId = "remoto_screen_share"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(NotificationManager::class.java)
            val channel = NotificationChannel(
                channelId,
                "Compartir pantalla",
                NotificationManager.IMPORTANCE_LOW,
            )
            manager.createNotificationChannel(channel)
        }

        val openAppIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE,
        )

        val notification: Notification = NotificationCompat.Builder(this, channelId)
            .setContentTitle("Remoto")
            .setContentText("Compartiendo tu pantalla con ${RemoteSession.peerName.ifBlank { "tu amigo" }}")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(openAppIntent)
            .setOngoing(true)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            ServiceCompat.startForeground(
                this,
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION,
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        RemoteSession.webRtcHost?.close()
        RemoteSession.webRtcHost = null
        eglBase?.release()
        eglBase = null
    }

    companion object {
        const val EXTRA_PROJECTION_DATA = "projection_data"
        const val EXTRA_WIDTH = "width"
        const val EXTRA_HEIGHT = "height"
        private const val NOTIFICATION_ID = 4201
    }
}
