package com.deliveryshield.delivery_shield_mobile

import android.app.Application
import com.kakaomobility.knsdk.KNSDK

/**
 * Installs Kakao Mobility KNSDK storage path at process start.
 * Separate from Kakao Maps SDK init (Flutter-side KakaoMapsFlutter.init).
 */
class DeliveryShieldApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        KNSDK.install(this, "$filesDir/kakao_navi_poc")
    }
}
