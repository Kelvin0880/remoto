package com.kelvingomez.remoto.host.input

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.os.Build
import android.os.Bundle
import android.view.accessibility.AccessibilityNodeInfo

/**
 * Traduce el protocolo de input (pensado originalmente para mouse) a gestos táctiles reales.
 * v1: sin mapeo para flechas/Tab, sin reposicionar el cursor en medio de un texto — documentado
 * en el README como limitación conocida.
 */
class GestureMapper(private val service: AccessibilityService) {
    private var lastX = -1f
    private var lastY = -1f

    fun apply(msg: InputMessage) {
        when (msg) {
            is InputMessage.Move -> {
                lastX = msg.x.toFloat()
                lastY = msg.y.toFloat()
            }
            is InputMessage.Click -> when (msg.button) {
                "right" -> longPress(lastX, lastY)
                "middle" -> Unit // sin equivalente táctil razonable, no-op documentado
                else -> tap(lastX, lastY)
            }
            is InputMessage.Scroll -> swipeScroll(msg.dy)
            is InputMessage.Text -> appendText(msg.value)
            is InputMessage.Key -> when (msg.value) {
                "Enter" -> submitOrNewline()
                "Backspace" -> backspace()
                "Escape" -> service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK)
                else -> Unit // Tab / flechas: sin mapeo en v1
            }
            is InputMessage.Nav -> when (msg.value) {
                "back" -> service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK)
                "home" -> service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_HOME)
                "recents" -> service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_RECENTS)
            }
        }
    }

    private fun tap(x: Float, y: Float) {
        if (x < 0 || y < 0) return
        dispatchStroke(x, y, x, y, 60)
    }

    private fun longPress(x: Float, y: Float) {
        if (x < 0 || y < 0) return
        dispatchStroke(x, y, x, y, 600)
    }

    private fun swipeScroll(dy: Int) {
        val cx = if (lastX >= 0f) lastX else 400f
        val cy = if (lastY >= 0f) lastY else 800f
        val delta = (-dy).coerceIn(-400, 400).toFloat() * 8f
        dispatchStroke(cx, cy, cx, (cy + delta).coerceAtLeast(0f), 150)
    }

    private fun dispatchStroke(x1: Float, y1: Float, x2: Float, y2: Float, durationMs: Long) {
        val path = Path().apply {
            moveTo(x1, y1)
            lineTo(x2, y2)
        }
        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, durationMs))
            .build()
        service.dispatchGesture(gesture, null, null)
    }

    private fun focusedEditableNode(): AccessibilityNodeInfo? =
        service.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)

    private fun appendText(chunk: String) {
        val node = focusedEditableNode() ?: return
        val current = node.text?.toString() ?: ""
        setNodeText(node, current + chunk)
    }

    private fun backspace() {
        val node = focusedEditableNode() ?: return
        val current = node.text?.toString() ?: ""
        if (current.isNotEmpty()) setNodeText(node, current.dropLast(1))
    }

    private fun submitOrNewline() {
        val node = focusedEditableNode() ?: return
        val handled = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            node.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_IME_ENTER.id)
        } else {
            false
        }
        if (!handled) appendText("\n")
    }

    private fun setNodeText(node: AccessibilityNodeInfo, text: String) {
        val args = Bundle()
        args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
        node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
    }
}
