package com.deliveryshield.delivery_shield_mobile

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Bundle
import android.view.View
import android.widget.ImageButton
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.kakaomobility.knsdk.KNLanguageType
import com.kakaomobility.knsdk.KNRoutePriority
import com.kakaomobility.knsdk.KNSDK
import com.kakaomobility.knsdk.common.objects.KNError
import com.kakaomobility.knsdk.common.objects.KNPOI
import com.kakaomobility.knsdk.guidance.knguidance.KNGuideRouteChangeReason
import com.kakaomobility.knsdk.guidance.knguidance.KNGuidance
import com.kakaomobility.knsdk.guidance.knguidance.KNGuidance_CitsGuideDelegate
import com.kakaomobility.knsdk.guidance.knguidance.KNGuidance_GuideStateDelegate
import com.kakaomobility.knsdk.guidance.knguidance.KNGuidance_LocationGuideDelegate
import com.kakaomobility.knsdk.guidance.knguidance.KNGuidance_RouteGuideDelegate
import com.kakaomobility.knsdk.guidance.knguidance.KNGuidance_SafetyGuideDelegate
import com.kakaomobility.knsdk.guidance.knguidance.KNGuidance_VoiceGuideDelegate
import com.kakaomobility.knsdk.guidance.knguidance.citsguide.KNGuide_Cits
import com.kakaomobility.knsdk.guidance.knguidance.common.KNLocation
import com.kakaomobility.knsdk.guidance.knguidance.locationguide.KNGuide_Location
import com.kakaomobility.knsdk.guidance.knguidance.routeguide.KNGuide_Route
import com.kakaomobility.knsdk.guidance.knguidance.routeguide.objects.KNMultiRouteInfo
import com.kakaomobility.knsdk.guidance.knguidance.safetyguide.KNGuide_Safety
import com.kakaomobility.knsdk.guidance.knguidance.safetyguide.objects.KNSafety
import com.kakaomobility.knsdk.guidance.knguidance.voiceguide.KNGuide_Voice
import com.kakaomobility.knsdk.trip.kntrip.KNTrip
import com.kakaomobility.knsdk.trip.kntrip.knroute.KNRoute
import com.kakaomobility.knsdk.ui.view.KNNaviView

/**
 * Dev-only POC: in-app Kakao Mobility navigation (KNNaviView).
 * Official sequence: KNSDK.install (Application) → initializeWithAppKey → then inflate KNNaviView.
 */
class KakaoNaviPocActivity :
    AppCompatActivity(),
    KNGuidance_GuideStateDelegate,
    KNGuidance_LocationGuideDelegate,
    KNGuidance_RouteGuideDelegate,
    KNGuidance_SafetyGuideDelegate,
    KNGuidance_VoiceGuideDelegate,
    KNGuidance_CitsGuideDelegate {

    companion object {
        const val EXTRA_APP_KEY = "extra_kakao_native_app_key"
        private const val PERMISSION_REQUEST_CODE = 9101
        private var sdkAuthCompleted = false
    }

    private var naviView: KNNaviView? = null
    private var markerHelper: KakaoNaviPocMarkerHelper? = null
    private var pendingAppKey: String? = null
    private var authStarted = false
    private var navLayoutInflated = false
    private var markersAttachScheduled = false
    private lateinit var sessionState: KakaoNaviPocSessionState
    private var actionPanel: KakaoNaviPocActionPanelController? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        KakaoNaviPocDiagnostics.lifecycle("onCreate")
        setContentView(R.layout.activity_kakao_navi_poc_loading)

        pendingAppKey = intent.getStringExtra(EXTRA_APP_KEY)?.trim()?.takeIf { it.isNotEmpty() }
        if (pendingAppKey == null) {
            toast("POC configuration error")
            finish()
            return
        }
        sessionState = KakaoNaviPocSessionState(KakaoNaviPocDeliveryFixture.destination)
        ensureLocationPermissionThenAuth()
    }

    private fun applyFullscreenWindow() {
        window?.apply {
            statusBarColor = Color.TRANSPARENT
            @Suppress("DEPRECATION")
            decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
        }
    }

    /** Inflate KNNaviView only after SDK auth — avoids GL surface before renderer init. */
    private fun inflateNaviLayoutIfNeeded() {
        if (navLayoutInflated) return
        navLayoutInflated = true
        setContentView(R.layout.activity_kakao_navi_poc)
        applyFullscreenWindow()
        val view = findViewById<KNNaviView>(R.id.navi_view)
        naviView = view
        markerHelper = KakaoNaviPocMarkerHelper(this).apply {
            setNavigationDestinationNumber(sessionState.navigationDestination.deliveryNumber)
            setOnDeliveryMarkerTapListener { delivery ->
                showDeliveryActionPanel(delivery)
            }
        }
        findViewById<ImageButton>(R.id.btn_close).setOnClickListener { finish() }
        actionPanel = KakaoNaviPocActionPanelController(
            activity = this,
            sessionState = sessionState,
            onCompleteConfirmed = { delivery -> completeDeliveryLocally(delivery) },
        ).also { controller ->
            controller.bind(findViewById(R.id.delivery_action_panel))
        }
        KakaoNaviPocDiagnostics.naviViewActivated()
        view.post { KakaoNaviPocDiagnostics.naviViewLayout(view) }
    }

    override fun onStart() {
        super.onStart()
        KakaoNaviPocDiagnostics.lifecycle("onStart")
    }

    override fun onResume() {
        super.onResume()
        KakaoNaviPocDiagnostics.lifecycle("onResume")
        naviView?.let { view ->
            view.post { KakaoNaviPocDiagnostics.naviViewLayout(view) }
        }
    }

    private fun ensureLocationPermissionThenAuth() {
        when {
            ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.ACCESS_FINE_LOCATION,
            ) == PackageManager.PERMISSION_GRANTED -> authenticateSdk()
            else -> ActivityCompat.requestPermissions(
                this,
                arrayOf(Manifest.permission.ACCESS_FINE_LOCATION),
                PERMISSION_REQUEST_CODE,
            )
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray,
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != PERMISSION_REQUEST_CODE) return
        if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            authenticateSdk()
        } else {
            toast("Location permission required for navigation POC")
            finish()
        }
    }

    private fun authenticateSdk() {
        if (authStarted) return
        authStarted = true

        if (sdkAuthCompleted) {
            KakaoNaviPocDiagnostics.authResult(success = true)
            requestRoute()
            return
        }

        val appKey = pendingAppKey ?: return
        KNSDK.initializeWithAppKey(
            appKey,
            BuildConfig.VERSION_NAME,
            "delivery_shield_poc_dev",
            "",
            KNLanguageType.KNLanguageType_KOREAN,
        ) { error: KNError? ->
            runOnUiThread {
                if (error != null) {
                    KakaoNaviPocDiagnostics.authResult(success = false, errorCode = error.code?.toString())
                    toast("Kakao nav SDK auth failed (${error.code})")
                    finish()
                } else {
                    sdkAuthCompleted = true
                    KakaoNaviPocDiagnostics.authResult(success = true)
                    requestRoute()
                }
            }
        }
    }

    private fun revealNaviViewThenStartGuide(
        trip: KNTrip,
        routePriority: KNRoutePriority,
        avoidOptions: Int,
    ) {
        inflateNaviLayoutIfNeeded()
        val view = naviView ?: return
        startGuide(trip, routePriority, avoidOptions)
        view.post { KakaoNaviPocDiagnostics.naviViewLayout(view) }
    }

    private fun requestRoute() {
        KakaoNaviPocDiagnostics.routeRequest(started = true)
        Thread {
            try {
                val (startPoi, goalPoi) = if (KakaoNaviPocConfig.USE_TUTORIAL_ROUTE) {
                    tutorialRoutePois()
                } else {
                    deliveryRoutePois()
                }
                KNSDK.makeTripWithStart(
                    startPoi,
                    goalPoi,
                    null,
                    "",
                ) { error: KNError?, trip: KNTrip? ->
                    runOnUiThread {
                        if (error != null || trip == null) {
                            KakaoNaviPocDiagnostics.routeResult(
                                success = false,
                                errorCode = error?.code?.toString(),
                            )
                            toast("Route request failed")
                            return@runOnUiThread
                        }
                        requestRoutePriorityThenGuide(trip)
                    }
                }
            } catch (error: Throwable) {
                KakaoNaviPocDiagnostics.caught("route_request", error)
                runOnUiThread { toast("Route request failed") }
            }
        }.start()
    }

    /** Official sequence: trip.routeWithPriority → sharedGuidance → initWithGuidance */
    private fun requestRoutePriorityThenGuide(trip: KNTrip) {
        val routePriority = KNRoutePriority.KNRoutePriority_Recommand
        val avoidOptions = 0
        trip.routeWithPriority(routePriority, avoidOptions) { error: KNError?, _ ->
            runOnUiThread {
                if (error != null) {
                    KakaoNaviPocDiagnostics.routeResult(
                        success = false,
                        errorCode = error.code?.toString(),
                    )
                    toast("Route request failed")
                    return@runOnUiThread
                }
                KakaoNaviPocDiagnostics.routeResult(success = true)
                revealNaviViewThenStartGuide(trip, routePriority, avoidOptions)
            }
        }
    }

    private fun tutorialRoutePois(): Pair<KNPOI, KNPOI> {
        val startPoi = KNPOI("POC_START", 309840, 552483, "POC_START")
        val goalPoi = KNPOI("POC_GOAL", 321497, 532896, "POC_GOAL")
        return startPoi to goalPoi
    }

    private fun deliveryRoutePois(): Pair<KNPOI, KNPOI> {
        val destination = KakaoNaviPocDeliveryFixture.destination
        val startPoi = poiFromKatec(
            KakaoNaviPocDeliveryFixture.START_LABEL,
            KakaoNaviPocDeliveryFixture.START_KATEC_X,
            KakaoNaviPocDeliveryFixture.START_KATEC_Y,
        )
        val goalPoi = poiFromKatec(
            "DELIVERY_${destination.deliveryNumber}",
            destination.katecX,
            destination.katecY,
        )
        return startPoi to goalPoi
    }

    private fun poiFromKatec(label: String, katecX: Float, katecY: Float): KNPOI {
        return KNPOI(label, katecX.toInt(), katecY.toInt(), label)
    }

    private fun startGuide(trip: KNTrip, routePriority: KNRoutePriority, avoidOptions: Int) {
        val guidance = KNSDK.sharedGuidance() ?: run {
            KakaoNaviPocDiagnostics.guidanceInit(success = false)
            toast("Guidance unavailable")
            return
        }
        guidance.guideStateDelegate = this
        guidance.locationGuideDelegate = this
        guidance.routeGuideDelegate = this
        guidance.safetyGuideDelegate = this
        guidance.voiceGuideDelegate = this
        guidance.citsGuideDelegate = this
        try {
            val view = naviView ?: return
            view.initWithGuidance(
                guidance,
                trip,
                routePriority,
                avoidOptions,
            )
            KakaoNaviPocDiagnostics.guidanceInit(success = true)
        } catch (error: Throwable) {
            KakaoNaviPocDiagnostics.caught("guidance_init", error)
            toast("Guidance init failed")
        }
    }

    private fun toast(message: String) {
        Toast.makeText(applicationContext, message, Toast.LENGTH_SHORT).show()
    }

    /** SELECT ONLY — does not change route, guidance, or navigation destination. */
    private fun showDeliveryActionPanel(delivery: KakaoNaviPocDelivery) {
        actionPanel?.show(delivery)
    }

    /** POC-local completion — does not change navigation destination or route. */
    private fun completeDeliveryLocally(delivery: KakaoNaviPocDelivery) {
        if (!sessionState.markCompleted(delivery.deliveryNumber)) {
            KakaoNaviPocDiagnostics.caught(
                "delivery_complete_duplicate",
                IllegalStateException("delivery ${delivery.deliveryNumber} already completed"),
            )
            return
        }
        markerHelper?.markDeliveryCompleted(delivery.deliveryNumber)
        KakaoNaviPocDiagnostics.deliveryCompletedLocal(
            deliveryNumber = delivery.deliveryNumber,
            navigationDestination = sessionState.navigationDestination.deliveryNumber,
        )
        actionPanel?.refresh()
    }

    override fun guidanceCheckingRouteChange(aGuidance: KNGuidance) {
        naviView?.guidanceCheckingRouteChange(aGuidance)
    }

    override fun guidanceDidUpdateRoutes(
        aGuidance: KNGuidance,
        aRoutes: List<KNRoute>,
        aMultiRouteInfo: KNMultiRouteInfo?,
    ) {
        naviView?.guidanceDidUpdateRoutes(aGuidance, aRoutes, aMultiRouteInfo)
    }

    override fun guidanceDidUpdateIndoorRoute(aGuidance: KNGuidance, aRoute: KNRoute?) {
        naviView?.guidanceDidUpdateIndoorRoute(aGuidance, aRoute)
    }

    override fun guidanceGuideEnded(aGuidance: KNGuidance) {
        naviView?.guidanceGuideEnded(aGuidance)
    }

    override fun guidanceGuideStarted(aGuidance: KNGuidance) {
        naviView?.guidanceGuideStarted(aGuidance)
        KakaoNaviPocDiagnostics.guidanceStarted()
    }

    private fun maybeAttachDeliveryMarkersOnce() {
        if (!KakaoNaviPocConfig.MARKERS_ENABLED || markersAttachScheduled) return
        val view = naviView ?: return
        markersAttachScheduled = true
        view.post {
            val mapView = view.mapComponent?.mapView
            KakaoNaviPocDiagnostics.mapAvailability(mapView)
            if (mapView == null) {
                KakaoNaviPocDiagnostics.caught(
                    "marker_attach",
                    IllegalStateException("navigation map unavailable after location update"),
                )
                return@post
            }
            try {
                markerHelper?.attachToNavigationMap(mapView)
            } catch (error: Throwable) {
                KakaoNaviPocDiagnostics.caught("guidance_started_markers", error)
            }
        }
    }

    override fun onDestroy() {
        KakaoNaviPocDiagnostics.lifecycle("onDestroy")
        markerHelper?.clearMarkers()
        super.onDestroy()
    }

    override fun guidanceOutOfRoute(aGuidance: KNGuidance) {
        naviView?.guidanceOutOfRoute(aGuidance)
    }

    override fun guidanceRouteChanged(
        aGuidance: KNGuidance,
        aFromRoute: KNRoute,
        aFromLocation: KNLocation,
        aToRoute: KNRoute,
        aToLocation: KNLocation,
        aChangeReason: KNGuideRouteChangeReason,
    ) {
        naviView?.guidanceRouteChanged(aGuidance)
    }

    override fun guidanceRouteUnchanged(aGuidance: KNGuidance) {
        naviView?.guidanceRouteUnchanged(aGuidance)
    }

    override fun guidanceRouteUnchangedWithError(aGuidnace: KNGuidance, aError: KNError) {
        naviView?.guidanceRouteUnchangedWithError(aGuidnace, aError)
    }

    override fun guidanceDidUpdateLocation(aGuidance: KNGuidance, aLocationGuide: KNGuide_Location) {
        naviView?.guidanceDidUpdateLocation(aGuidance, aLocationGuide)
        maybeAttachDeliveryMarkersOnce()
    }

    override fun guidanceDidUpdateRouteGuide(aGuidance: KNGuidance, aRouteGuide: KNGuide_Route) {
        naviView?.guidanceDidUpdateRouteGuide(aGuidance, aRouteGuide)
    }

    override fun guidanceDidUpdateAroundSafeties(
        aGuidance: KNGuidance,
        aSafeties: List<KNSafety>?,
    ) {
        naviView?.guidanceDidUpdateAroundSafeties(aGuidance, aSafeties)
    }

    override fun guidanceDidUpdateSafetyGuide(aGuidance: KNGuidance, aSafetyGuide: KNGuide_Safety?) {
        naviView?.guidanceDidUpdateSafetyGuide(aGuidance, aSafetyGuide)
    }

    override fun didFinishPlayVoiceGuide(aGuidance: KNGuidance, aVoiceGuide: KNGuide_Voice) {
        naviView?.didFinishPlayVoiceGuide(aGuidance, aVoiceGuide)
    }

    override fun shouldPlayVoiceGuide(
        aGuidance: KNGuidance,
        aVoiceGuide: KNGuide_Voice,
        aNewData: MutableList<ByteArray>,
    ): Boolean = naviView?.shouldPlayVoiceGuide(aGuidance, aVoiceGuide, aNewData) ?: false

    override fun willPlayVoiceGuide(aGuidance: KNGuidance, aVoiceGuide: KNGuide_Voice) {
        naviView?.willPlayVoiceGuide(aGuidance, aVoiceGuide)
    }

    override fun didUpdateCitsGuide(aGuidance: KNGuidance, aCitsGuide: KNGuide_Cits) {
        naviView?.didUpdateCitsGuide(aGuidance, aCitsGuide)
    }
}
