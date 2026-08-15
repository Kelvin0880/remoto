package com.kelvingomez.remoto.host.signaling

import android.os.Handler
import android.os.Looper
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/** Mismo protocolo 1:1 que app/src/signaling.js — mensajes JSON sobre WebSocket. */
class SignalingClient(
    private val url: String,
    private val onOpen: () -> Unit,
    private val onMessage: (JSONObject) -> Unit,
    private val onUnexpectedClose: () -> Unit,
    private val onConnectError: () -> Unit,
) {
    private val client = OkHttpClient.Builder()
        .pingInterval(20, TimeUnit.SECONDS)
        .build()
    private var ws: WebSocket? = null
    private var intentionalClose = false
    private var opened = false
    private val mainHandler = Handler(Looper.getMainLooper())

    fun connect() {
        val request = Request.Builder().url(url).build()
        ws = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                opened = true
                mainHandler.post { onOpen() }
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                val json = try {
                    JSONObject(text)
                } catch (e: Exception) {
                    null
                } ?: return
                mainHandler.post { onMessage(json) }
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                if (!intentionalClose) mainHandler.post { onUnexpectedClose() }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                if (intentionalClose) return
                mainHandler.post { if (opened) onUnexpectedClose() else onConnectError() }
            }
        })
    }

    fun send(payload: JSONObject) {
        ws?.send(payload.toString())
    }

    fun close() {
        intentionalClose = true
        ws?.close(1000, null)
    }
}
