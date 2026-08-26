package com.deliveryshield.delivery_shield_mobile

import android.os.Build
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            "delivery_shield/device",
        ).setMethodCallHandler { call, result ->
            when (call.method) {
                "primaryAbi" -> {
                    result.success(Build.SUPPORTED_ABIS.firstOrNull() ?: "")
                }
                else -> result.notImplemented()
            }
        }
    }
}
