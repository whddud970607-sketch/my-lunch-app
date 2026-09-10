package com.deliveryshield.delivery_shield_mobile

import android.app.Activity
import android.content.Context
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.StandardMessageCodec
import io.flutter.plugin.platform.PlatformView
import io.flutter.plugin.platform.PlatformViewFactory

/**
 * Factory for MP-C2B TMAP Vector Map PlatformView (`TMapView`).
 * One view instance per Flutter [AndroidView]; does not package a second VSM.
 */
class TmapVectorMapFactory(
    private val messenger: BinaryMessenger,
    private val activity: Activity,
) : PlatformViewFactory(StandardMessageCodec.INSTANCE) {
    override fun create(context: Context, viewId: Int, args: Any?): PlatformView {
        @Suppress("UNCHECKED_CAST")
        val params = args as? Map<String, Any?>
        return TmapVectorMapPlatformView(
            context = context,
            activity = activity,
            messenger = messenger,
            viewId = viewId,
            creationParams = params,
        )
    }
}
