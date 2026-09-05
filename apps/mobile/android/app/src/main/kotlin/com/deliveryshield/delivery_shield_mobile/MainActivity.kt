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
        MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            "delivery_shield/tmap_navi_poc",
        ).setMethodCallHandler { call, result ->
            when (call.method) {
                "launch" -> {
                    val apiKey = call.argument<String>("apiKey")?.trim()
                    if (apiKey.isNullOrEmpty()) {
                        result.error("missing_key", "TMAP API key required", null)
                        return@setMethodCallHandler
                    }
                    val intent = Intent(this, TmapNaviPocActivity::class.java)
                    intent.putExtra(
                        TmapNaviPocActivity.EXTRA_CLIENT_ID,
                        call.argument<String>("clientId")?.trim().orEmpty(),
                    )
                    intent.putExtra(TmapNaviPocActivity.EXTRA_API_KEY, apiKey)
                    intent.putExtra(
                        TmapNaviPocActivity.EXTRA_USER_KEY,
                        call.argument<String>("userKey")?.trim().orEmpty(),
                    )
                    intent.putExtra(
                        TmapNaviPocActivity.EXTRA_DEVICE_KEY,
                        call.argument<String>("deviceKey")?.trim().orEmpty(),
                    )
                    val destLat = call.argument<Number>("destLatitude")?.toDouble()
                    val destLng = call.argument<Number>("destLongitude")?.toDouble()
                    if (destLat != null && destLng != null) {
                        intent.putExtra(TmapNaviPocActivity.EXTRA_DEST_LAT, destLat)
                        intent.putExtra(TmapNaviPocActivity.EXTRA_DEST_LNG, destLng)
                        intent.putExtra(
                            TmapNaviPocActivity.EXTRA_DEST_NAME,
                            call.argument<String>("destName")?.trim().orEmpty(),
                        )
                    }
                    startActivity(intent)
                    result.success(null)
                }
                else -> result.notImplemented()
            }
        }
    }
}
