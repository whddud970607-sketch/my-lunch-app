package com.deliveryshield.delivery_shield_mobile

import android.util.Log
import android.view.View
import com.kakaomobility.knsdk.map.knmapview.KNMapView
import com.kakaomobility.knsdk.ui.view.KNNaviView

/**
 * Non-sensitive diagnostic logging for Kakao nav POC regressions.
 */
object KakaoNaviPocDiagnostics {
    private const val TAG = "KakaoNaviPocDiag"

    fun lifecycle(event: String) {
        Log.i(TAG, "lifecycle event=$event")
    }

    fun authResult(
        success: Boolean,
        errorCode: String? = null,
        errorMsg: String? = null,
        errorTagMsg: String? = null,
        extraType: String? = null,
    ) {
        if (success) {
            Log.i(TAG, "sdk_auth success=true")
        } else {
            // Never log appKey / credentials — code/msg/tagMsg/extra type only.
            Log.w(
                TAG,
                "sdk_auth success=false errorCode=${errorCode ?: "unknown"} " +
                    "msg=${errorMsg ?: ""} tagMsg=${errorTagMsg ?: ""} " +
                    "extraType=${extraType ?: ""}",
            )
        }
    }

    fun routeRequest(started: Boolean) {
        Log.i(TAG, "route_request started=$started tutorial=${KakaoNaviPocConfig.USE_TUTORIAL_ROUTE}")
    }

    fun routeResult(success: Boolean, errorCode: String? = null) {
        if (success) {
            Log.i(TAG, "route_result success=true")
        } else {
            Log.w(TAG, "route_result success=false errorCode=${errorCode ?: "unknown"}")
        }
    }

    fun guidanceInit(success: Boolean) {
        Log.i(TAG, "guidance_init success=$success")
    }

    fun naviViewActivated() {
        Log.i(TAG, "navi_view activated after sdk_auth")
    }

    fun guidanceStarted() {
        Log.i(TAG, "guidance_started")
    }

    fun naviViewLayout(naviView: KNNaviView) {
        Log.i(
            TAG,
            "navi_view_layout width=${naviView.width} height=${naviView.height} " +
                "measuredW=${naviView.measuredWidth} measuredH=${naviView.measuredHeight}",
        )
    }

    fun mapAvailability(mapView: KNMapView?) {
        if (mapView == null) {
            Log.w(TAG, "map_view available=false")
            return
        }
        Log.i(
            TAG,
            "map_view available=true width=${mapView.width} height=${mapView.height} " +
                "visibility=${visibilityName(mapView.visibility)}",
        )
    }

    fun markerAttach(
        requested: Int,
        completed: Int,
        listenerAttached: Boolean,
    ) {
        Log.i(
            TAG,
            "marker_attach requested=$requested completed=$completed listenerAttached=$listenerAttached",
        )
    }

    fun markerTapped(deliveryNumber: Int) {
        Log.i(TAG, "marker_tapped deliveryNumber=$deliveryNumber")
    }

    fun markerTapRaw(markerId: Int, markerTag: Int) {
        Log.i(TAG, "marker_tap_raw markerId=$markerId markerTag=$markerTag")
    }

    fun markerScreenPosition(deliveryNumber: Int, screenX: Float, screenY: Float, onScreen: Boolean, pass: Int = 0) {
        Log.i(
            TAG,
            "marker_screen pass=$pass deliveryNumber=$deliveryNumber x=${screenX.toInt()} y=${screenY.toInt()} onScreen=$onScreen",
        )
    }

    fun markerListenerPreserved(listenerClass: String) {
        Log.i(TAG, "marker_listener_preserved class=$listenerClass")
    }

    fun infoCardShown(deliveryNumber: Int, visible: Boolean) {
        Log.i(TAG, "info_card deliveryNumber=$deliveryNumber visible=$visible")
    }

    fun actionPanelShown(deliveryNumber: Int, expanded: Boolean, visible: Boolean = true) {
        Log.i(
            TAG,
            "action_panel deliveryNumber=$deliveryNumber expanded=$expanded visible=$visible",
        )
    }

    fun deliveryCompleteConfirmationShown(deliveryNumber: Int) {
        Log.i(TAG, "delivery_complete_confirm deliveryNumber=$deliveryNumber")
    }

    fun deliveryCompleteCancelled(deliveryNumber: Int) {
        Log.i(TAG, "delivery_complete_cancelled deliveryNumber=$deliveryNumber")
    }

    fun deliveryCompletedLocal(deliveryNumber: Int, navigationDestination: Int) {
        Log.i(
            TAG,
            "delivery_completed_local deliveryNumber=$deliveryNumber navigationDestination=$navigationDestination",
        )
    }

    fun markerVisualUpdated(deliveryNumber: Int, completed: Boolean) {
        Log.i(TAG, "marker_visual_updated deliveryNumber=$deliveryNumber completed=$completed")
    }

    fun caught(stage: String, error: Throwable) {
        Log.e(TAG, "caught stage=$stage type=${error.javaClass.simpleName} message=${error.message}")
    }

    private fun visibilityName(visibility: Int): String {
        return when (visibility) {
            View.VISIBLE -> "visible"
            View.INVISIBLE -> "invisible"
            View.GONE -> "gone"
            else -> visibility.toString()
        }
    }
}
