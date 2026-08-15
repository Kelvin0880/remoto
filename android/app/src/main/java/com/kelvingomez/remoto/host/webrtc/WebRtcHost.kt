package com.kelvingomez.remoto.host.webrtc

import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjection
import com.kelvingomez.remoto.host.session.RemoteSession
import org.webrtc.DataChannel
import org.webrtc.DefaultVideoDecoderFactory
import org.webrtc.DefaultVideoEncoderFactory
import org.webrtc.EglBase
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.MediaStream
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.RtpReceiver
import org.webrtc.ScreenCapturerAndroid
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
import org.webrtc.SurfaceTextureHelper
import org.webrtc.VideoCapturer
import org.webrtc.VideoSource
import java.nio.ByteBuffer

/**
 * Lado "host" del protocolo WebRTC — equivalente Kotlin de app/src/webrtc.js +
 * la mitad de beginHostWebRTC() en app/src/main.js. El host siempre es quien ofrece el SDP,
 * porque es dueño del track de video (la captura de pantalla).
 */
class WebRtcHost(
    private val context: Context,
    private val eglBase: EglBase,
    private val onIceCandidate: (IceCandidate) -> Unit,
    private val onLocalOffer: (SessionDescription) -> Unit,
    private val onConnectionState: (PeerConnection.PeerConnectionState) -> Unit,
) {
    private val factory: PeerConnectionFactory
    private var peerConnection: PeerConnection? = null
    private var videoCapturer: VideoCapturer? = null
    private var videoSource: VideoSource? = null
    private var surfaceTextureHelper: SurfaceTextureHelper? = null
    private var dataChannel: DataChannel? = null

    init {
        PeerConnectionFactory.initialize(
            PeerConnectionFactory.InitializationOptions.builder(context)
                .createInitializationOptions(),
        )
        val encoderFactory = DefaultVideoEncoderFactory(eglBase.eglBaseContext, true, true)
        val decoderFactory = DefaultVideoDecoderFactory(eglBase.eglBaseContext)
        factory = PeerConnectionFactory.builder()
            .setVideoEncoderFactory(encoderFactory)
            .setVideoDecoderFactory(decoderFactory)
            .createPeerConnectionFactory()
    }

    fun start(mediaProjectionData: Intent, screenWidth: Int, screenHeight: Int) {
        val iceServers = listOf(
            PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer(),
        )
        val rtcConfig = PeerConnection.RTCConfiguration(iceServers)

        peerConnection = factory.createPeerConnection(rtcConfig, object : PeerConnection.Observer {
            override fun onIceCandidate(candidate: IceCandidate) = onIceCandidate.invoke(candidate)
            override fun onConnectionChange(newState: PeerConnection.PeerConnectionState) =
                onConnectionState.invoke(newState)
            override fun onDataChannel(channel: DataChannel) = Unit
            override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>) = Unit
            override fun onIceConnectionChange(newState: PeerConnection.IceConnectionState) = Unit
            override fun onIceConnectionReceivingChange(receiving: Boolean) = Unit
            override fun onIceGatheringChange(newState: PeerConnection.IceGatheringState) = Unit
            override fun onAddStream(stream: MediaStream) = Unit
            override fun onRemoveStream(stream: MediaStream) = Unit
            override fun onRenegotiationNeeded() = Unit
            override fun onAddTrack(receiver: RtpReceiver, streams: Array<out MediaStream>) = Unit
            override fun onSignalingChange(newState: PeerConnection.SignalingState) = Unit
        }) ?: return

        videoCapturer = ScreenCapturerAndroid(
            mediaProjectionData,
            object : MediaProjection.Callback() {
                override fun onStop() {
                    onConnectionState.invoke(PeerConnection.PeerConnectionState.DISCONNECTED)
                }
            },
        )

        surfaceTextureHelper = SurfaceTextureHelper.create("RemotoCaptureThread", eglBase.eglBaseContext)
        videoSource = factory.createVideoSource(true)
        videoCapturer?.initialize(surfaceTextureHelper, context, videoSource!!.capturerObserver)
        videoCapturer?.startCapture(screenWidth, screenHeight, 30)

        val videoTrack = factory.createVideoTrack("remoto_video_track", videoSource)
        peerConnection?.addTrack(videoTrack, listOf("remoto_stream"))

        val dc = peerConnection?.createDataChannel("input", DataChannel.Init())
        dataChannel = dc
        dc?.registerObserver(object : DataChannel.Observer {
            override fun onBufferedAmountChange(previousAmount: Long) = Unit
            override fun onStateChange() = Unit
            override fun onMessage(buffer: DataChannel.Buffer) {
                val bytes = ByteArray(buffer.data.remaining())
                buffer.data.get(bytes)
                RemoteSession.handleIncomingInput(String(bytes, Charsets.UTF_8))
            }
        })

        createOffer()
    }

    private fun createOffer() {
        val constraints = MediaConstraints()
        peerConnection?.createOffer(object : SdpObserver {
            override fun onCreateSuccess(desc: SessionDescription) {
                peerConnection?.setLocalDescription(
                    object : SdpObserver {
                        override fun onCreateSuccess(p0: SessionDescription?) = Unit
                        override fun onSetSuccess() = onLocalOffer.invoke(desc)
                        override fun onCreateFailure(p0: String?) = Unit
                        override fun onSetFailure(p0: String?) = Unit
                    },
                    desc,
                )
            }
            override fun onSetSuccess() = Unit
            override fun onCreateFailure(error: String?) = Unit
            override fun onSetFailure(error: String?) = Unit
        }, constraints)
    }

    fun setRemoteAnswer(sdp: String) {
        peerConnection?.setRemoteDescription(
            object : SdpObserver {
                override fun onCreateSuccess(p0: SessionDescription?) = Unit
                override fun onSetSuccess() = Unit
                override fun onCreateFailure(p0: String?) = Unit
                override fun onSetFailure(p0: String?) = Unit
            },
            SessionDescription(SessionDescription.Type.ANSWER, sdp),
        )
    }

    fun addRemoteIceCandidate(candidate: IceCandidate) {
        peerConnection?.addIceCandidate(candidate)
    }

    fun close() {
        dataChannel?.close()
        videoCapturer?.stopCapture()
        videoCapturer?.dispose()
        videoSource?.dispose()
        surfaceTextureHelper?.dispose()
        peerConnection?.close()
        peerConnection = null
    }
}
