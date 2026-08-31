package com.deliveryshield.delivery_shield_mobile

import android.content.Intent
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
        MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            "delivery_shield/kakao_navi_poc",
        ).setMethodCallHandler { call, result ->
            when (call.method) {
                "launch" -> {
                    val appKey = call.argument<String>("appKey")?.trim()
                    if (appKey.isNullOrEmpty()) {
                        result.error("missing_key", "Native app key required", null)
                        return@setMethodCallHandler
                    }
                    val intent = Intent(this, KakaoNaviPocActivity::class.java)
                    intent.putExtra(KakaoNaviPocActivity.EXTRA_APP_KEY, appKey)
                    startActivity(intent)
                    result.success(null)
                }
                else -> result.notImplemented()
            }
        }
    }
}
