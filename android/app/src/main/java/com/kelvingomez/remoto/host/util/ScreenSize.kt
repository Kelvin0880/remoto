package com.kelvingomez.remoto.host.util

import android.content.Context
import android.graphics.Point
import android.os.Build
import android.view.WindowManager

object ScreenSize {
    fun get(context: Context): Point {
        val wm = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val bounds = wm.currentWindowMetrics.bounds
            Point(bounds.width(), bounds.height())
        } else {
            val point = Point()
            @Suppress("DEPRECATION")
            wm.defaultDisplay.getRealSize(point)
            point
        }
    }
}
