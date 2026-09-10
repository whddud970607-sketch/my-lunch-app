package com.deliveryshield.delivery_shield_mobile

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import android.util.Log
import android.view.View
import android.widget.ImageButton
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding
import androidx.fragment.app.FragmentManager
import com.skt.tmap.engine.navigation.SDKManager
import com.skt.tmap.engine.navigation.network.ndds.CarOilType
import com.skt.tmap.engine.navigation.network.ndds.NddsDataType.DestSearchFlag
import com.skt.tmap.engine.navigation.network.ndds.TollCarType
import com.skt.tmap.engine.navigation.route.RoutePlanType
import com.skt.tmap.engine.navigation.route.data.MapPoint
import com.skt.tmap.engine.navigation.route.data.WayPoint
import com.skt.tmap.vsm.coordinates.VSMCoordinates
import com.tmapmobility.tmap.tmapsdk.ui.data.CarOption
import com.tmapmobility.tmap.tmapsdk.ui.data.MapSetting
import com.tmapmobility.tmap.tmapsdk.ui.fragment.NavigationFragment
import com.tmapmobility.tmap.tmapsdk.ui.util.TmapUISDK
import com.tmapmobility.tmap.tmapsdk.ui.util.TmapUISDK.Companion.getFragment
import com.tmapmobility.tmap.tmapsdk.ui.util.TmapUISDK.Companion.initialize
import com.tmapmobility.tmap.tmapsdk.ui.util.TmapUISDK.DrivingStatusCallback
import com.tmapmobility.tmap.tmapsdk.ui.util.TmapUISDK.InitializeListener
import com.tmapmobility.tmap.tmapsdk.ui.util.TmapUISDK.RouteRequestListener

/**
 * Dev-only isolated PoC: TMAP Navi UI SDK (V1.77 / tmap-ui-sdk 1.0.0.0158).
 * Does not touch Kakao/Naver production map or workday flows.
 */
class TmapNaviPocActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_CLIENT_ID = "extra_tmap_client_id"
        const val EXTRA_API_KEY = "extra_tmap_api_key"
        const val EXTRA_USER_KEY = "extra_tmap_user_key"
        const val EXTRA_DEVICE_KEY = "extra_tmap_device_key"
        const val EXTRA_DEST_LAT = "extra_tmap_dest_lat"
        const val EXTRA_DEST_LNG = "extra_tmap_dest_lng"
        const val EXTRA_DEST_NAME = "extra_tmap_dest_name"
        /** When true: product path — real dest required; no fixture fallback. */
        const val EXTRA_PRODUCT_MODE = "extra_tmap_product_mode"
        const val EXTRA_POINT_ID = "extra_tmap_point_id"
        private const val TAG = "TmapNavi"
        private const val PERMISSION_REQUEST_CODE = 9201
    }

    private lateinit var navigationFragment: NavigationFragment
    private lateinit var fragmentManager: FragmentManager
    private lateinit var statusView: TextView

    private var clientId: String = ""
    private var apiKey: String = ""
    private var userKey: String = ""
    private var deviceKey: String = ""
    private var destLat: Double? = null
    private var destLng: Double? = null
    private var destName: String = ""
    private var productMode: Boolean = false
    private var pointId: String = ""
    private var initStarted = false
    private var routeRequested = false
    private var exiting = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_tmap_navi_poc)
        Log.i(TAG, "NAV_ACTIVITY_CREATED")

        clientId = intent.getStringExtra(EXTRA_CLIENT_ID)?.trim().orEmpty()
        apiKey = intent.getStringExtra(EXTRA_API_KEY)?.trim().orEmpty()
        userKey = intent.getStringExtra(EXTRA_USER_KEY)?.trim().orEmpty()
        deviceKey = intent.getStringExtra(EXTRA_DEVICE_KEY)?.trim().orEmpty()
        productMode = intent.getBooleanExtra(EXTRA_PRODUCT_MODE, false)
        pointId = intent.getStringExtra(EXTRA_POINT_ID)?.trim().orEmpty()
        if (intent.hasExtra(EXTRA_DEST_LAT) && intent.hasExtra(EXTRA_DEST_LNG)) {
            destLat = intent.getDoubleExtra(EXTRA_DEST_LAT, 0.0)
            destLng = intent.getDoubleExtra(EXTRA_DEST_LNG, 0.0)
            destName = intent.getStringExtra(EXTRA_DEST_NAME)?.trim().orEmpty()
        }

        statusView = findViewById(R.id.poc_status)
        val chrome = findViewById<View>(R.id.poc_chrome)
        chrome.bringToFront()
        // Close control was laid out under the StatusBar window (y=23..158 vs statusBars 0..105).
        // Center taps hit SystemUI, so the ImageButton listener never ran.
        ViewCompat.setOnApplyWindowInsetsListener(chrome) { view, insets ->
            val statusBars = insets.getInsets(WindowInsetsCompat.Type.statusBars())
            view.updatePadding(top = statusBars.top)
            insets
        }
        ViewCompat.requestApplyInsets(chrome)
        findViewById<ImageButton>(R.id.btn_close).setOnClickListener {
            Log.i(TAG, "NAV_CANCELLED")
            exitPoc()
        }

        if (apiKey.isEmpty()) {
            Log.e(TAG, "NAV_FAILED reason=missing_api_key")
            setStatus("TMAP config error: API key missing")
            toast("티맵 길찾기 설정 오류")
            finish()
            return
        }

        if (productMode && !hasValidDestination()) {
            Log.e(TAG, "NAV_FAILED reason=invalid_destination")
            setStatus("Invalid destination")
            toast("배송지 좌표가 없어 길찾기를 열 수 없습니다")
            finish()
            return
        }

        attachNavigationFragment()
        wireBackPress()
        ensureLocationPermissionThenInit()
    }

    private fun hasValidDestination(): Boolean {
        val lat = destLat
        val lng = destLng
        return lat != null && lng != null &&
            lat != 0.0 && lng != 0.0 &&
            lat.isFinite() && lng.isFinite()
    }

    private fun attachNavigationFragment() {
        fragmentManager = supportFragmentManager
        val existing = fragmentManager.findFragmentById(R.id.tmap_ui_container) as? NavigationFragment
        navigationFragment = existing ?: getFragment().also { fragment ->
            fragmentManager.beginTransaction()
                .add(R.id.tmap_ui_container, fragment)
                .commitAllowingStateLoss()
        }
        Log.i(TAG, "NAV_FRAGMENT_ATTACHED")

        navigationFragment.drivingStatusCallback = object : DrivingStatusCallback {
            override fun onStartNavigationInfo(
                totalDistanceInMeter: Int,
                totalTimeInSec: Int,
                tollFee: Int,
            ) {
                Log.d(TAG, "onStartNavigationInfo d=$totalDistanceInMeter t=$totalTimeInSec")
            }

            override fun onUserRerouteComplete() {
                Log.d(TAG, "onUserRerouteComplete")
            }

            override fun onStartNavigation() {
                Log.i(TAG, "NAV_STARTED")
                runOnUiThread { setStatus("Guidance started") }
            }

            override fun onStopNavigation() {
                Log.i(TAG, "NAV_STOPPED")
                runOnUiThread {
                    setStatus("Guidance stopped")
                    if (exiting && !isFinishing) {
                        finish()
                    }
                }
            }

            override fun onTryToStopNavigation(): Boolean {
                // Let official stopDrive() proceed; host finish() is in exitPoc/onStopNavigation.
                return true
            }

            override fun onRouteChanged(index: Int) {
                Log.d(TAG, "onRouteChanged $index")
            }

            override fun onRouteOptionChanged(
                originalOption: RoutePlanType,
                changedOption: RoutePlanType,
            ) {
                Log.d(TAG, "onRouteOptionChanged")
            }

            override fun onPermissionDenied(errorCode: Int, errorMsg: String?) {
                runOnUiThread {
                    setStatus("Permission denied ($errorCode)")
                    toast("Location permission required for TMAP POC")
                }
            }

            override fun onPeriodicRerouteComplete() {
                Log.d(TAG, "onPeriodicRerouteComplete")
            }

            override fun onPeriodicReroute() {
                Log.d(TAG, "onPeriodicReroute")
            }

            override fun onPassedViaPoint() {
                Log.d(TAG, "onPassedViaPoint")
            }

            override fun onPassedTollgate(fee: Int) {
                Log.d(TAG, "onPassedTollgate")
            }

            override fun onPassedAlternativeRouteJunction() {
                Log.d(TAG, "onPassedAlternativeRouteJunction")
            }

            override fun onNoLocationSignal(noLocationSignal: Boolean) {
                Log.d(TAG, "onNoLocationSignal=$noLocationSignal")
            }

            override fun onLocationChanged() {
                // High-frequency; avoid UI spam.
            }

            override fun onFailRouteRequest(errorCode: String, errorMessage: String) {
                Log.e(TAG, "NAV_FAILED phase=route_callback code=$errorCode")
                runOnUiThread {
                    setStatus("Route callback fail ($errorCode)")
                }
            }

            override fun onDoNotRerouteToDestinationComplete() {
                Log.d(TAG, "onDoNotRerouteToDestinationComplete")
            }

            override fun onDestinationDirResearchComplete() {
                Log.d(TAG, "onDestinationDirResearchComplete")
            }

            override fun onChangeRouteOptionComplete(routePlanType: RoutePlanType) {
                Log.d(TAG, "onChangeRouteOptionComplete")
            }

            override fun onBreakawayFromRouteEvent() {
                Log.d(TAG, "onBreakawayFromRouteEvent")
            }

            override fun onBreakAwayRequestComplete() {
                Log.d(TAG, "onBreakAwayRequestComplete")
            }

            override fun onArrivedDestination(
                destination: String,
                drivingTime: Int,
                drivingDistance: Int,
            ) {
                runOnUiThread { setStatus("Arrived ($destination)") }
            }

            override fun onApproachingViaPoint() {
                Log.d(TAG, "onApproachingViaPoint")
            }

            override fun onApproachingAlternativeRoute() {
                Log.d(TAG, "onApproachingAlternativeRoute")
            }

            override fun onForceReroute(periodicType: DestSearchFlag) {
                Log.d(TAG, "onForceReroute")
            }
        }
    }

    private fun wireBackPress() {
        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    Log.d(TAG, "system back")
                    // Official sample lets SDK consume back and stay in MainActivity.
                    // Isolated PoC must not trap the user during active guidance.
                    if (::navigationFragment.isInitialized) {
                        navigationFragment.onBackKeyPressed()
                    }
                    exitPoc()
                }
            },
        )
    }

    private fun ensureLocationPermissionThenInit() {
        val fine = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
        if (fine == PackageManager.PERMISSION_GRANTED) {
            initSdk()
            return
        }
        setStatus("Requesting location permission…")
        ActivityCompat.requestPermissions(
            this,
            arrayOf(
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION,
            ),
            PERMISSION_REQUEST_CODE,
        )
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray,
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != PERMISSION_REQUEST_CODE) return
        val granted = grantResults.isNotEmpty() &&
            grantResults.any { it == PackageManager.PERMISSION_GRANTED }
        if (granted) {
            initSdk()
        } else {
            setStatus("Location permission denied")
            toast("Location permission required")
        }
    }

    private fun initSdk() {
        if (initStarted) return
        initStarted = true
        setStatus("Initializing TMAP SDK…")

        initialize(
            this,
            clientId,
            apiKey,
            userKey,
            deviceKey,
            object : InitializeListener {
                override fun onSuccess() {
                    Log.i(TAG, "NAV_SDK_INIT_OK")
                    runOnUiThread {
                        setStatus("SDK initialized — requesting route…")
                        navigationFragment.setSettings(
                            MapSetting().apply {
                                isShowClosedPopup = false
                            },
                        )
                        TmapUISDK.setUsePeriodicReroute(applicationContext, true)
                        requestSyntheticRoute()
                    }
                }

                override fun onFail(errorCode: Int, errorMsg: String?) {
                    Log.e(TAG, "NAV_FAILED phase=init code=$errorCode")
                    runOnUiThread {
                        setStatus("Init failed ($errorCode)")
                        toast("티맵 길찾기 초기화 실패")
                        if (productMode) {
                            finish()
                        }
                    }
                }

                override fun savedRouteInfoExists(destinationName: String?) {
                    Log.d(TAG, "savedRouteInfoExists")
                }
            },
            null,
        )
    }

    private fun requestSyntheticRoute() {
        if (routeRequested) return
        routeRequested = true

        val carOption = CarOption().apply {
            carType = TollCarType.Car
            oilType = CarOilType.Gasoline
            isHipassOn = true
        }
        navigationFragment.carOption = carOption

        SDKManager.getInstance().requestCurrentLocation { currentLocation ->
            val currentName = try {
                VSMCoordinates.getAddressOffline(
                    currentLocation.longitude,
                    currentLocation.latitude,
                )
            } catch (_: Exception) {
                "POC_START"
            }
            val startPoint = WayPoint(
                currentName,
                MapPoint(currentLocation.longitude, currentLocation.latitude),
            )
            val destLatitude = destLat
            val destLongitude = destLng
            val endPoint = if (hasValidDestination() &&
                destLatitude != null &&
                destLongitude != null
            ) {
                // MapPoint(lon, lat) — TMAP engine order.
                WayPoint(
                    destName.ifEmpty { "배송지" },
                    MapPoint(destLongitude, destLatitude),
                )
            } else if (!productMode) {
                WayPoint(
                    TmapNaviPocFixture.DESTINATION_LABEL,
                    MapPoint(
                        TmapNaviPocFixture.DESTINATION_LONGITUDE,
                        TmapNaviPocFixture.DESTINATION_LATITUDE,
                    ),
                )
            } else {
                Log.e(TAG, "NAV_FAILED reason=missing_destination_at_route")
                runOnUiThread {
                    toast("배송지 좌표가 없어 길찾기를 열 수 없습니다")
                    finish()
                }
                return@requestCurrentLocation
            }
            val planTypes = arrayListOf(
                RoutePlanType.Traffic_Recommend,
                RoutePlanType.Traffic_Free,
            )

            runOnUiThread {
                Log.i(TAG, "ROUTE_REQUESTED")
                navigationFragment.requestRoute(
                    startPoint,
                    null,
                    endPoint,
                    true,
                    object : RouteRequestListener {
                        override fun onSuccess() {
                            Log.i(TAG, "ROUTE_SUCCESS")
                            setStatus("Route OK — guidance UI")
                        }

                        override fun onFail(errorCode: Int, errorMsg: String?) {
                            Log.e(TAG, "NAV_FAILED phase=route_request code=$errorCode")
                            setStatus("Route failed ($errorCode)")
                            toast("티맵 경로 요청 실패")
                            if (productMode) {
                                // Fail-safe: return to Delivery Shield map.
                                finish()
                            }
                        }
                    },
                    planTypes,
                )
            }
        }
    }

    private fun exitPoc() {
        if (exiting) {
            if (!isFinishing) {
                finish()
            }
            return
        }
        exiting = true
        Log.i(TAG, "NAV_ACTIVITY_FINISHED")
        stopDriveQuietly()
        if (::fragmentManager.isInitialized && ::navigationFragment.isInitialized) {
            try {
                fragmentManager.beginTransaction()
                    .remove(navigationFragment)
                    .commitNowAllowingStateLoss()
            } catch (_: Exception) {
                // Fragment may already be gone
            }
        }
        finish()
    }

    private fun stopDriveQuietly() {
        if (!::navigationFragment.isInitialized) return
        try {
            navigationFragment.stopDrive()
        } catch (_: Exception) {
            // PoC teardown — ignore if fragment not ready
        }
    }

    private fun setStatus(message: String) {
        statusView.text = message
    }

    private fun toast(message: String) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
    }
}
