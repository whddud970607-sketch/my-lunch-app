package com.deliveryshield.delivery_shield_mobile

import android.app.Application
import android.os.SystemClock
import android.util.Log
import com.kakaomobility.knsdk.KNSDK

/**
 * Installs Kakao Mobility KNSDK storage path at process start.
 * Separate from Kakao Maps SDK init (Flutter-side KakaoMapsFlutter.init).
 */
class DeliveryShieldApplication : Application() {
    override fun onCreate() {
        val t0 = SystemClock.elapsedRealtime()
        processStartElapsedMs = t0
        Log.i(PERF_TAG, "mark=APP_PROCESS_START elapsed_realtime_ms=$t0")
        Log.i(PERF_TAG, "mark=APPLICATION_ONCREATE_START elapsed_realtime_ms=$t0")
        super.onCreate()
        // PERF-S1: measure KNSDK.install; do not move/alter install behavior.
        val installStart = SystemClock.elapsedRealtime()
        KNSDK.install(this, "$filesDir/kakao_navi_poc")
        val installEnd = SystemClock.elapsedRealtime()
        Log.i(
            PERF_TAG,
            "mark=KNSDK_INSTALL_DURATION_MS duration_ms=${installEnd - installStart} " +
                "elapsed_realtime_ms=$installEnd",
        )
        Log.i(
            PERF_TAG,
            "mark=APPLICATION_ONCREATE_END elapsed_realtime_ms=${SystemClock.elapsedRealtime()} " +
                "duration_ms=${SystemClock.elapsedRealtime() - t0}",
        )
    }

    companion object {
        const val PERF_TAG = "DS_PERF"
        @JvmStatic
        var processStartElapsedMs: Long = 0L
    }
}
