package com.kelvingomez.remoto.host.input

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityEvent
import com.kelvingomez.remoto.host.session.RemoteSession

/**
 * Solo existe para poder llamar dispatchGesture()/performGlobalAction() — no reacciona a
 * eventos de accesibilidad del sistema. El usuario tiene que habilitarlo a mano en
 * Ajustes > Accesibilidad (no hay forma de activarlo por código, es una protección de Android).
 */
class RemoteInputAccessibilityService : AccessibilityService() {

    private lateinit var mapper: GestureMapper

    override fun onServiceConnected() {
        super.onServiceConnected()
        mapper = GestureMapper(this)
        RemoteSession.inputHandler = { msg -> mapper.apply(msg) }
        isConnected = true
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) = Unit

    override fun onInterrupt() = Unit

    override fun onDestroy() {
        super.onDestroy()
        RemoteSession.inputHandler = null
        isConnected = false
    }

    companion object {
        var isConnected: Boolean = false
    }
}
