package com.deliveryshield.delivery_shield_mobile

import android.os.Bundle
import android.util.Log
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.kakaomobility.knsdk.KNLanguageType
import com.kakaomobility.knsdk.KNSDK
import com.kakaomobility.knsdk.common.objects.KNError
import java.io.BufferedReader
import java.io.InputStreamReader

/**
 * Isolated KNSDK authentication diagnostic — no map, route, markers, or KNNaviView.
 *
 * Same applicationId / signing / Native App Key source / knsdk_ui:1.12.7 as product.
 * Not a launcher activity; start via adb or debug MethodChannel only.
 */
class KakaoKnsdkAuthOnlyPocActivity : AppCompatActivity() {
    companion object {
        const val EXTRA_APP_KEY = "extra_kakao_native_app_key"
        /** Optional; omit or empty → null userKey (first isolation test). */
        const val EXTRA_USER_KEY = "extra_user_key"
        private const val TAG = "KakaoKnsdkAuthPoc"
        private const val ENV_ASSET = "flutter_assets/.env"
        private const val ENV_KEY = "KAKAO_NATIVE_APP_KEY"
    }

    private var statusView: TextView? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val tv = TextView(this).apply {
            setPadding(48, 96, 48, 48)
            textSize = 14f
            text = "KNSDK auth-only PoC…"
        }
        statusView = tv
        setContentView(tv)

        Log.i(TAG, "POC_START")
        logInstallState()

        val appKey = resolveAppKey()
        val keyPresent = !appKey.isNullOrEmpty()
        Log.i(TAG, "APP_KEY_PRESENT=$keyPresent")
        Log.i(TAG, "APP_KEY_LENGTH=${appKey?.length ?: 0}")
        Log.i(TAG, "CLIENT_VERSION=${BuildConfig.VERSION_NAME}")

        val userKeyExtra = intent.getStringExtra(EXTRA_USER_KEY)?.trim()?.takeIf { it.isNotEmpty() }
        val userKeyMode = if (userKeyExtra == null) "NULL" else "PROVIDED"
        Log.i(TAG, "USER_KEY_MODE=$userKeyMode")
        Log.i(TAG, "FOURTH_STRING_MODE=NULL")
        Log.i(TAG, "LANGUAGE=KOREAN")

        if (!keyPresent) {
            Log.w(TAG, "AUTH_SUCCESS=false")
            Log.w(TAG, "AUTH_ERROR_CODE=missing_app_key")
            Log.w(TAG, "AUTH_ERROR_MSG=Native app key missing")
            Log.w(TAG, "AUTH_TAG_MSG=")
            Log.w(TAG, "AUTH_EXTRA_TYPE=")
            finishWithStatus("FAIL: missing app key")
            return
        }

        // Official-compatible: userKey null (first isolation); undocumented 4th String = null.
        KNSDK.initializeWithAppKey(
            appKey!!,
            BuildConfig.VERSION_NAME,
            userKeyExtra,
            null,
            KNLanguageType.KNLanguageType_KOREAN,
        ) { error: KNError? ->
            runOnUiThread {
                if (error != null) {
                    Log.w(TAG, "AUTH_SUCCESS=false")
                    Log.w(TAG, "AUTH_ERROR_CODE=${error.code}")
                    Log.w(TAG, "AUTH_ERROR_MSG=${error.msg ?: ""}")
                    Log.w(TAG, "AUTH_TAG_MSG=${error.tagMsg ?: ""}")
                    Log.w(TAG, "AUTH_EXTRA_TYPE=${error.extra?.javaClass?.simpleName ?: ""}")
                    Toast.makeText(
                        this,
                        "KNSDK auth PoC fail (${error.code})",
                        Toast.LENGTH_LONG,
                    ).show()
                    finishWithStatus("FAIL ${error.code}: ${error.msg}")
                } else {
                    Log.i(TAG, "AUTH_SUCCESS=true")
                    Log.i(TAG, "AUTH_ERROR_CODE=")
                    Log.i(TAG, "AUTH_ERROR_MSG=")
                    Log.i(TAG, "AUTH_TAG_MSG=")
                    Log.i(TAG, "AUTH_EXTRA_TYPE=")
                    Toast.makeText(this, "KNSDK auth PoC OK", Toast.LENGTH_LONG).show()
                    finishWithStatus("SUCCESS")
                }
            }
        }
    }

    private fun logInstallState() {
        // Application already called KNSDK.install; surface whatever is observable.
        val state =
            try {
                KNSDK.toString()
            } catch (_: Throwable) {
                "unavailable"
            }
        Log.i(TAG, "KNSDK_INSTALL_STATE=install_called_in_Application state=$state")
    }

    /**
     * Same key source as product: MethodChannel/extra from Flutter AppConfig, else bundled
     * `flutter_assets/.env` (identical asset Flutter dotenv loads).
     */
    private fun resolveAppKey(): String? {
        intent.getStringExtra(EXTRA_APP_KEY)?.trim()?.takeIf { it.isNotEmpty() }?.let {
            return it
        }
        return readBundledEnvKey(ENV_KEY)
    }

    private fun readBundledEnvKey(name: String): String? {
        return try {
            assets.open(ENV_ASSET).use { stream ->
                BufferedReader(InputStreamReader(stream)).useLines { lines ->
                    lines
                        .map { it.trim() }
                        .firstOrNull { it.startsWith("$name=") }
                        ?.substringAfter("=", "")
                        ?.trim()
                        ?.takeIf { it.isNotEmpty() }
                }
            }
        } catch (_: Throwable) {
            null
        }
    }

    private fun finishWithStatus(status: String) {
        statusView?.text = "KNSDK auth-only PoC\n$status\n(see logcat $TAG)"
        // Keep screen briefly readable; auto-finish after toast window.
        window.decorView.postDelayed({ if (!isFinishing) finish() }, 2500)
    }
}
