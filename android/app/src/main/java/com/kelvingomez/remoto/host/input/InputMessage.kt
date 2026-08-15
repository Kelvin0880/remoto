package com.kelvingomez.remoto.host.input

import org.json.JSONObject

/** Espejo en Kotlin del protocolo de input que ya manda app/src/input-capture.js. */
sealed class InputMessage {
    data class Move(val x: Int, val y: Int) : InputMessage()
    data class Click(val button: String) : InputMessage()
    data class Scroll(val dy: Int) : InputMessage()
    data class Text(val value: String) : InputMessage()
    data class Key(val value: String) : InputMessage()
    data class Nav(val value: String) : InputMessage()

    companion object {
        fun parse(json: String): InputMessage? = try {
            val obj = JSONObject(json)
            when (obj.optString("t")) {
                "move" -> Move(obj.getInt("x"), obj.getInt("y"))
                "click" -> Click(obj.optString("button", "left"))
                "scroll" -> Scroll(obj.optInt("dy", 0))
                "text" -> Text(obj.optString("value", ""))
                "key" -> Key(obj.optString("value", ""))
                "nav" -> Nav(obj.optString("value", ""))
                else -> null
            }
        } catch (e: Exception) {
            null
        }
    }
}
