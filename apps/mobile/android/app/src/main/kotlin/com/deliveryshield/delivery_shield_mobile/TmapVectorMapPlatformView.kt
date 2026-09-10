package com.deliveryshield.delivery_shield_mobile

import android.app.Activity
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.PointF
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.util.Log
import android.util.TypedValue
import android.view.Gravity
import android.view.SurfaceView
import android.view.TextureView
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import android.widget.FrameLayout
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.PopupWindow
import android.widget.ProgressBar
import android.widget.TextView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import com.skt.tmap.TMapData
import com.skt.tmap.TMapPoint
import com.skt.tmap.TMapView
import com.skt.tmap.overlay.TMapMarkerItem
import com.skt.tmap.overlay.TMapPolyLine
import com.skt.tmap.poi.TMapPOIItem
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import io.flutter.plugin.platform.PlatformView
import java.util.ArrayList
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

/**
 * TMAP Vector Map PlatformView for Delivery Shield map tab.
 *
 * Owns exactly one [TMapView]. Flutter remains source of truth for pins /
 * selection / driver GPS; this view is a renderer adapter only.
 */
class TmapVectorMapPlatformView(
    context: Context,
    private val activity: Activity,
    messenger: BinaryMessenger,
    viewId: Int,
    creationParams: Map<String, Any?>?,
) : PlatformView, MethodChannel.MethodCallHandler, DefaultLifecycleObserver {
    private val tag = "TmapVectorMap"
    private val channel = MethodChannel(
        messenger,
        "delivery_shield/tmap_vector_map_$viewId",
    )
    private val container = FrameLayout(context)
    private val mapView: TMapView = TMapView(context)
    /**
     * Delivery Shield HUD presentation.
     *
     * Same-window siblings of an on-top [SurfaceView] are covered. Presentation
     * therefore uses [PopupWindow] (separate window above SurfaceView). Flutter
     * remains source of truth; this only mirrors presentation + input.
     */
    private var summaryPopup: PopupWindow? = null
    private var locationPopup: PopupWindow? = null
    private lateinit var style: TmapHudStyle
    private lateinit var summaryRoot: LinearLayout
    private lateinit var hudCard: LinearLayout
    private lateinit var hudTitle: TextView
    private lateinit var hudTotal: TextView
    private lateinit var hudCompleted: TextView
    private lateinit var hudRemaining: TextView
    private lateinit var hudSummaryRow: LinearLayout
    private lateinit var refreshBtn: ImageButton
    private lateinit var layersBtn: ImageButton
    private lateinit var refreshSpinner: ProgressBar
    private lateinit var myLocationBtn: FrameLayout
    private lateinit var myLocationIcon: ImageView
    private var hudLayoutListener: ViewTreeObserver.OnGlobalLayoutListener? = null
    private var followActiveVisual = false

    private var disposed = false
    private var mapReadyEmitted = false
    private var authSucceeded = false
    private var resumed = false

    private val deliveryMarkerIds = ConcurrentHashMap.newKeySet<String>()
    private var selectedMarkerId: String? = null
    private var driverPresent = false

    // Coalesce latest Flutter state until MAP_READY.
    private var pendingPins: List<Map<String, Any?>>? = null
    private var pendingSelectedId: String? = null
    private var pendingDriver: Map<String, Any?>? = null
    private var pendingRemoveDriver = false
    private var pendingCamera: Map<String, Any?>? = null
    /** Latest-wins generation for async [TMapData.findPathDataWithType] callbacks. */
    private val routeGeneration = AtomicInteger(0)
    private var pendingRoutePolylinePoints: List<Map<String, Any?>>? = null
    private var pendingCarRoutePreview: Map<String, Any?>? = null
    private var routePolylinePresent = false

    private val initialLat: Double =
        (creationParams?.get("latitude") as? Number)?.toDouble() ?: 37.5665
    private val initialLng: Double =
        (creationParams?.get("longitude") as? Number)?.toDouble() ?: 126.9780

    init {
        channel.setMethodCallHandler(this)
        container.layoutParams = FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT,
        )
        mapView.layoutParams = FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT,
        )
        // Demote SurfaceView as soon as VSM adds it — ideally before surface attach.
        installSurfaceDemotionWatcher(mapView)
        installSurfaceDemotionWatcher(container)
        container.addView(mapView)
        buildHudWidgets(context)
        wireHudLayoutTracking()
        wireInteractionListeners()

        val apiKey = (creationParams?.get("apiKey") as? String)?.trim().orEmpty()
        if (apiKey.isEmpty()) {
            Log.e(tag, "state=AUTH_FAILED reason=missing_api_key")
            emit("onAuthFailed", mapOf("message" to "missing_api_key"))
        } else {
            Log.i(tag, "state=AUTH_PENDING")
            emit("onState", mapOf("state" to "AUTH_PENDING"))
            mapView.setOnApiKeyListenerCallback(
                object : TMapView.OnApiKeyListenerCallback {
                    override fun onSKTMapApikeySucceed() {
                        if (disposed) return
                        authSucceeded = true
                        Log.i(tag, "state=AUTH_SUCCESS")
                        emit("onAuthSuccess", emptyMap())
                    }

                    override fun onSKTMapApikeyFailed(errorMsg: String?) {
                        if (disposed) return
                        val safe = sanitizeError(errorMsg)
                        Log.e(tag, "state=AUTH_FAILED message=$safe")
                        emit(
                            "onAuthFailed",
                            mapOf("message" to (safe.ifEmpty { "auth_failed" })),
                        )
                    }
                },
            )
            mapView.setOnMapReadyListener(
                object : TMapView.OnMapReadyListener {
                    override fun onMapReady() {
                        if (disposed || mapReadyEmitted) return
                        mapReadyEmitted = true
                        try {
                            mapView.setCenterPoint(initialLat, initialLng)
                            mapView.setZoomLevel(15)
                        } catch (t: Throwable) {
                            Log.e(tag, "state=MAP_FAILED phase=center", t)
                            emit(
                                "onMapFailed",
                                mapOf("message" to (t.javaClass.simpleName)),
                            )
                            return
                        }
                        applyPendingState()
                        demoteSurfaceViews(reason = "onMapReady")
                        ensureHudWindowsVisible()
                        container.post {
                            if (!disposed) {
                                demoteSurfaceViews(reason = "onMapReady_post")
                                ensureHudWindowsVisible()
                            }
                        }
                        Log.i(tag, "state=MAP_READY")
                        emit("onMapReady", emptyMap())
                    }
                },
            )
            try {
                mapView.setSKTMapApiKey(apiKey)
            } catch (t: Throwable) {
                Log.e(tag, "state=AUTH_FAILED phase=setSKTMapApiKey", t)
                emit(
                    "onAuthFailed",
                    mapOf("message" to (t.javaClass.simpleName)),
                )
            }
        }

        val owner = activity as? LifecycleOwner
        if (owner != null) {
            activity.runOnUiThread {
                if (!disposed) {
                    owner.lifecycle.addObserver(this)
                    if (owner.lifecycle.currentState.isAtLeast(
                            androidx.lifecycle.Lifecycle.State.RESUMED,
                        )
                    ) {
                        resumeMap()
                    }
                }
            }
        } else {
            resumeMap()
        }
    }

    override fun getView(): View = container

    override fun dispose() {
        if (disposed) return
        disposed = true
        routeGeneration.incrementAndGet()
        pendingRoutePolylinePoints = null
        pendingCarRoutePreview = null
        Log.i(tag, "state=DISPOSED")
        dismissHudWindows()
        val listener = hudLayoutListener
        if (listener != null) {
            container.viewTreeObserver.removeOnGlobalLayoutListener(listener)
            hudLayoutListener = null
        }
        (activity as? LifecycleOwner)?.lifecycle?.removeObserver(this)
        channel.setMethodCallHandler(null)
        try {
            if (resumed) {
                mapView.onPause()
                resumed = false
            }
        } catch (t: Throwable) {
            Log.w(tag, "onPause during dispose", t)
        }
        try {
            mapView.onDestroy()
        } catch (t: Throwable) {
            Log.w(tag, "onDestroy during dispose", t)
        }
        deliveryMarkerIds.clear()
        routePolylinePresent = false
        container.removeAllViews()
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        if (disposed) {
            result.error("disposed", "TMapView disposed", null)
            return
        }
        when (call.method) {
            "getState" -> {
                result.success(
                    mapOf(
                        "disposed" to disposed,
                        "authSucceeded" to authSucceeded,
                        "mapReady" to mapReadyEmitted,
                    ),
                )
            }
            "syncPins" -> {
                val pins = parsePinList(call.arguments)
                if (!mapReadyEmitted) {
                    pendingPins = pins
                    result.success(null)
                    return
                }
                runOnUi {
                    syncPinsInternal(pins)
                    result.success(null)
                }
            }
            "upsertPin" -> {
                val pin = parsePinMap(call.arguments as? Map<*, *>)
                if (pin == null) {
                    result.success(null)
                    return
                }
                if (!mapReadyEmitted) {
                    val cur = pendingPins?.toMutableList() ?: mutableListOf()
                    cur.removeAll { it["markerId"] == pin["markerId"] }
                    cur.add(pin)
                    pendingPins = cur
                    result.success(null)
                    return
                }
                runOnUi {
                    upsertPinInternal(pin)
                    result.success(null)
                }
            }
            "removePin" -> {
                val id = (call.argument<String>("markerId") ?: "").trim()
                if (id.isEmpty()) {
                    result.success(null)
                    return
                }
                if (!mapReadyEmitted) {
                    pendingPins = pendingPins?.filterNot { it["markerId"] == id }
                    result.success(null)
                    return
                }
                runOnUi {
                    removePinInternal(id)
                    result.success(null)
                }
            }
            "setSelectedMarkerId" -> {
                val id = call.argument<String>("markerId")?.trim()
                if (!mapReadyEmitted) {
                    pendingSelectedId = id
                    result.success(null)
                    return
                }
                runOnUi {
                    setSelectedInternal(id)
                    result.success(null)
                }
            }
            "upsertDriverMarker" -> {
                @Suppress("UNCHECKED_CAST")
                val args = call.arguments as? Map<String, Any?>
                if (args == null) {
                    result.success(null)
                    return
                }
                if (!mapReadyEmitted) {
                    pendingDriver = args
                    pendingRemoveDriver = false
                    result.success(null)
                    return
                }
                runOnUi {
                    upsertDriverInternal(args)
                    result.success(null)
                }
            }
            "removeDriverMarker" -> {
                if (!mapReadyEmitted) {
                    pendingDriver = null
                    pendingRemoveDriver = true
                    result.success(null)
                    return
                }
                runOnUi {
                    removeDriverInternal()
                    result.success(null)
                }
            }
            "setShieldHud" -> {
                @Suppress("UNCHECKED_CAST")
                val args = call.arguments as? Map<String, Any?>
                runOnUi {
                    applyShieldHud(args)
                    result.success(null)
                }
            }
            "moveCamera" -> {
                @Suppress("UNCHECKED_CAST")
                val args = call.arguments as? Map<String, Any?>
                if (args == null) {
                    result.success(null)
                    return
                }
                if (!mapReadyEmitted) {
                    // Coalesce: keep only latest camera intent.
                    pendingCamera = args
                    result.success(null)
                    return
                }
                runOnUi {
                    moveCameraInternal(args)
                    result.success(null)
                }
            }
            "getCenter" -> {
                if (!mapReadyEmitted) {
                    result.success(null)
                    return
                }
                try {
                    val c = mapView.centerPoint
                    result.success(
                        mapOf(
                            "latitude" to c.latitude,
                            "longitude" to c.longitude,
                        ),
                    )
                } catch (t: Throwable) {
                    Log.w(tag, "getCenter failed", t)
                    result.success(null)
                }
            }
            "getZoomLevel" -> {
                if (!mapReadyEmitted) {
                    result.success(null)
                    return
                }
                try {
                    result.success(mapView.zoomLevel)
                } catch (t: Throwable) {
                    Log.w(tag, "getZoomLevel failed", t)
                    result.success(null)
                }
            }
            "setRoutePolyline" -> {
                @Suppress("UNCHECKED_CAST")
                val args = call.arguments as? Map<String, Any?>
                val points = parseRoutePoints(args?.get("points"))
                routeGeneration.incrementAndGet()
                pendingCarRoutePreview = null
                if (!mapReadyEmitted) {
                    pendingRoutePolylinePoints = points
                    result.success(null)
                    return
                }
                runOnUi {
                    applyRoutePolylinePoints(points)
                    result.success(null)
                }
            }
            "clearRoutePolyline" -> {
                routeGeneration.incrementAndGet()
                pendingRoutePolylinePoints = null
                pendingCarRoutePreview = null
                if (!mapReadyEmitted) {
                    result.success(null)
                    return
                }
                runOnUi {
                    clearRouteInternal()
                    result.success(null)
                }
            }
            "requestCarRoutePreview" -> {
                @Suppress("UNCHECKED_CAST")
                val args = call.arguments as? Map<String, Any?>
                if (args == null) {
                    result.success(mapOf("ok" to false, "reason" to "invalid_args"))
                    return
                }
                val gen = routeGeneration.incrementAndGet()
                pendingRoutePolylinePoints = null
                if (!mapReadyEmitted) {
                    pendingCarRoutePreview = args
                    result.success(mapOf("ok" to true, "queued" to true))
                    return
                }
                runOnUi {
                    requestCarRoutePreviewInternal(args, gen)
                    result.success(mapOf("ok" to true, "queued" to false))
                }
            }
            else -> result.notImplemented()
        }
    }

    override fun onResume(owner: LifecycleOwner) {
        resumeMap()
    }

    override fun onPause(owner: LifecycleOwner) {
        pauseMap()
    }

    override fun onDestroy(owner: LifecycleOwner) {
        if (!disposed) {
            dispose()
        }
    }

    private fun wireInteractionListeners() {
        mapView.setOnClickListenerCallback(
            object : TMapView.OnClickListenerCallback {
                override fun onPressDown(
                    markerList: ArrayList<TMapMarkerItem>?,
                    poiList: ArrayList<TMapPOIItem>?,
                    point: TMapPoint?,
                    pointF: PointF?,
                ) {
                }

                override fun onPressUp(
                    markerList: ArrayList<TMapMarkerItem>?,
                    poiList: ArrayList<TMapPOIItem>?,
                    point: TMapPoint?,
                    pointF: PointF?,
                ) {
                    if (disposed) return
                    val id = markerList
                        ?.asSequence()
                        ?.mapNotNull { it.id?.trim() }
                        ?.firstOrNull { it.isNotEmpty() && it != DRIVER_MARKER_ID }
                        ?: return
                    emit("onPinTap", mapOf("markerId" to id))
                }
            },
        )
        mapView.setOnPanChangedListener {
            if (!disposed) emit("onUserGesture", emptyMap())
        }
        mapView.setOnZoomChangedListener {
            if (!disposed) emit("onUserGesture", emptyMap())
        }
        mapView.setOnPinchListener(
            object : TMapView.OnPinchListenerCallback {
                override fun onPinchIn() {
                    if (!disposed) emit("onUserGesture", emptyMap())
                }

                override fun onPinchOut() {
                    if (!disposed) emit("onUserGesture", emptyMap())
                }

                override fun onPinchStart() {
                    if (!disposed) emit("onUserGesture", emptyMap())
                }

                override fun onPinchEnd() {
                    if (!disposed) emit("onUserGesture", emptyMap())
                }
            },
        )
        mapView.setOnRotationChangedListener {
            if (!disposed) emit("onUserGesture", emptyMap())
        }
    }

    private fun applyPendingState() {
        if (disposed) return
        pendingPins?.let { syncPinsInternal(it) }
        pendingPins = null
        if (pendingRemoveDriver) {
            removeDriverInternal()
            pendingRemoveDriver = false
        }
        pendingDriver?.let { upsertDriverInternal(it) }
        pendingDriver = null
        pendingSelectedId?.let { setSelectedInternal(it) }
        pendingSelectedId = null
        pendingCamera?.let { moveCameraInternal(it) }
        pendingCamera = null
        val queuedPoints = pendingRoutePolylinePoints
        pendingRoutePolylinePoints = null
        val queuedPreview = pendingCarRoutePreview
        pendingCarRoutePreview = null
        if (queuedPoints != null) {
            applyRoutePolylinePoints(queuedPoints)
        } else if (queuedPreview != null) {
            requestCarRoutePreviewInternal(queuedPreview, routeGeneration.get())
        }
    }

    private fun syncPinsInternal(pins: List<Map<String, Any?>>) {
        if (disposed) return
        val nextIds = linkedSetOf<String>()
        for (pin in pins) {
            val id = (pin["markerId"] as? String)?.trim().orEmpty()
            if (id.isEmpty()) continue
            nextIds.add(id)
            try {
                upsertPinInternal(pin)
            } catch (t: Throwable) {
                Log.w(tag, "syncPins upsert failed id=$id", t)
            }
        }
        val toRemove = deliveryMarkerIds.filter { it !in nextIds }
        for (id in toRemove) {
            try {
                removePinInternal(id)
            } catch (t: Throwable) {
                Log.w(tag, "syncPins remove failed id=$id", t)
            }
        }
        selectedMarkerId?.let { setSelectedInternal(it) }
        Log.i(tag, "syncPins count=${nextIds.size}")
    }

    private fun upsertPinInternal(pin: Map<String, Any?>) {
        if (disposed) return
        val id = (pin["markerId"] as? String)?.trim().orEmpty()
        if (id.isEmpty() || id == DRIVER_MARKER_ID) return
        val lat = (pin["latitude"] as? Number)?.toDouble()
        val lng = (pin["longitude"] as? Number)?.toDouble()
        if (lat == null || lng == null || !isValidCoord(lat, lng)) {
            Log.w(tag, "upsertPin skip invalid coords id=$id")
            return
        }
        val iconBytes = pin["iconBytes"] as? ByteArray
        val selected = pin["selected"] == true || id == selectedMarkerId
        val marker = TMapMarkerItem().apply {
            setId(id)
            setName(id)
            // TMapView / sample use latitude, longitude order.
            setTMapPoint(lat, lng)
            setPosition(0.5f, 1.0f)
            setVisible(true)
            setEnableClustering(false)
            if (iconBytes != null && iconBytes.isNotEmpty()) {
                decodeBitmap(iconBytes)?.let { setIcon(it) }
            }
            // Selected: raise priority so it draws above neighbors.
            setPriority(if (selected) 1.0f else 0.0f)
            setCanShowCallout(false)
        }
        try {
            if (deliveryMarkerIds.contains(id) || mapView.getMarkerItemFromId(id) != null) {
                mapView.updateTMapMarkerItem(marker)
            } else {
                mapView.addTMapMarkerItem(marker)
            }
            deliveryMarkerIds.add(id)
            if (selected) {
                mapView.bringMarkerToFront(marker)
            }
        } catch (t: Throwable) {
            Log.w(tag, "upsertPinInternal failed id=$id", t)
        }
    }

    private fun removePinInternal(id: String) {
        if (disposed || id.isEmpty()) return
        try {
            mapView.removeTMapMarkerItem(id)
        } catch (t: Throwable) {
            Log.w(tag, "removePinInternal failed id=$id", t)
        }
        deliveryMarkerIds.remove(id)
        if (selectedMarkerId == id) {
            selectedMarkerId = null
        }
    }

    private fun setSelectedInternal(id: String?) {
        if (disposed) return
        val previous = selectedMarkerId
        selectedMarkerId = id?.trim()?.takeIf { it.isNotEmpty() }
        // Re-apply priority on previous + new if still present.
        for (markerId in listOfNotNull(previous, selectedMarkerId)) {
            try {
                val existing = mapView.getMarkerItemFromId(markerId) ?: continue
                existing.setPriority(if (markerId == selectedMarkerId) 1.0f else 0.0f)
                mapView.updateTMapMarkerItem(existing)
                if (markerId == selectedMarkerId) {
                    mapView.bringMarkerToFront(existing)
                }
            } catch (t: Throwable) {
                Log.w(tag, "setSelectedInternal failed id=$markerId", t)
            }
        }
    }

    private fun upsertDriverInternal(args: Map<String, Any?>) {
        if (disposed) return
        val lat = (args["latitude"] as? Number)?.toDouble()
        val lng = (args["longitude"] as? Number)?.toDouble()
        if (lat == null || lng == null || !isValidCoord(lat, lng)) {
            Log.w(tag, "upsertDriver skip invalid coords")
            return
        }
        val heading = (args["headingDegrees"] as? Number)?.toFloat()
        val iconBytes = args["iconBytes"] as? ByteArray
        val point = if (heading != null && heading.isFinite()) {
            TMapPoint(lat, lng, heading)
        } else {
            TMapPoint(lat, lng)
        }
        val marker = TMapMarkerItem().apply {
            setId(DRIVER_MARKER_ID)
            setName(DRIVER_MARKER_ID)
            setTMapPoint(point)
            setPosition(0.5f, 0.5f)
            setVisible(true)
            setEnableClustering(false)
            setCanShowCallout(false)
            setPriority(2.0f)
            if (iconBytes != null && iconBytes.isNotEmpty()) {
                decodeBitmap(iconBytes)?.let { setIcon(it) }
            }
        }
        try {
            if (driverPresent || mapView.getMarkerItemFromId(DRIVER_MARKER_ID) != null) {
                mapView.updateTMapMarkerItem(marker)
            } else {
                mapView.addTMapMarkerItem(marker)
            }
            driverPresent = true
            mapView.bringMarkerToFront(marker)
            val attached = mapView.getMarkerItemFromId(DRIVER_MARKER_ID) != null
            Log.i(
                tag,
                "TMAP_DRIVER_MARKER_CREATED=YES " +
                    "TMAP_DRIVER_MARKER_ATTACHED=${if (attached) "YES" else "NO"} " +
                    "TMAP_DRIVER_MARKER_VISIBLE=YES " +
                    "GPS_POSITION_AVAILABLE=YES",
            )
        } catch (t: Throwable) {
            Log.w(tag, "upsertDriverInternal failed", t)
        }
    }

    private fun removeDriverInternal() {
        if (disposed) return
        try {
            mapView.removeTMapMarkerItem(DRIVER_MARKER_ID)
        } catch (t: Throwable) {
            Log.w(tag, "removeDriverInternal failed", t)
        }
        driverPresent = false
    }

    private fun moveCameraInternal(args: Map<String, Any?>) {
        if (disposed) return
        val lat = (args["latitude"] as? Number)?.toDouble()
        val lng = (args["longitude"] as? Number)?.toDouble()
        if (lat == null || lng == null || !isValidCoord(lat, lng)) return
        val zoom = (args["zoom"] as? Number)?.toInt()
        val animated = args["animated"] != false
        try {
            if (zoom != null) {
                mapView.setZoomLevel(zoom.coerceIn(6, 18))
            }
            mapView.setCenterPoint(lat, lng, animated)
        } catch (t: Throwable) {
            Log.w(tag, "moveCameraInternal failed", t)
        }
    }

    @Suppress("UNCHECKED_CAST")
    private fun parseRoutePoints(raw: Any?): List<Map<String, Any?>> {
        val list = raw as? List<*> ?: return emptyList()
        val out = ArrayList<Map<String, Any?>>(list.size)
        for (item in list) {
            val map = item as? Map<*, *> ?: continue
            val lat = (map["latitude"] as? Number)?.toDouble()
            val lng = (map["longitude"] as? Number)?.toDouble()
            if (lat == null || lng == null || !isValidCoord(lat, lng)) continue
            out.add(mapOf("latitude" to lat, "longitude" to lng))
        }
        return out
    }

    private fun requestCarRoutePreviewInternal(args: Map<String, Any?>, generation: Int) {
        if (disposed) return
        val startLat = (args["startLatitude"] as? Number)?.toDouble()
        val startLng = (args["startLongitude"] as? Number)?.toDouble()
        val destLat = (args["destLatitude"] as? Number)?.toDouble()
        val destLng = (args["destLongitude"] as? Number)?.toDouble()
        if (startLat == null || startLng == null || destLat == null || destLng == null ||
            !isValidCoord(startLat, startLng) || !isValidCoord(destLat, destLng)
        ) {
            Log.w(tag, "route=INVALID_COORDS")
            clearRouteInternal()
            emit(
                "onRoutePreviewResult",
                mapOf("ok" to false, "reason" to "invalid_coords"),
            )
            return
        }
        // Do not draw stale geometry while a newer request is in flight.
        clearRouteInternal()
        Log.i(tag, "route=REQUESTED gen=$generation")
        try {
            val start = TMapPoint(startLat, startLng)
            val end = TMapPoint(destLat, destLng)
            val data = TMapData()
            data.findPathDataWithType(
                TMapData.TMapPathType.CAR_PATH,
                start,
                end,
                object : TMapData.OnFindPathDataWithTypeListener {
                    override fun onFindPathDataWithType(polyLine: TMapPolyLine?) {
                        if (disposed || generation != routeGeneration.get()) {
                            Log.i(tag, "route=STALE_IGNORED gen=$generation")
                            return
                        }
                        activity.runOnUiThread {
                            if (disposed || generation != routeGeneration.get()) {
                                Log.i(tag, "route=STALE_IGNORED_UI gen=$generation")
                                return@runOnUiThread
                            }
                            val points = polyLine?.linePointList
                            if (polyLine == null || points == null || points.size < 2) {
                                Log.w(tag, "route=EMPTY_OR_NULL gen=$generation")
                                clearRouteInternal()
                                emit(
                                    "onRoutePreviewResult",
                                    mapOf("ok" to false, "reason" to "empty_geometry"),
                                )
                                return@runOnUiThread
                            }
                            try {
                                applyNativePolyLine(polyLine)
                                Log.i(
                                    tag,
                                    "route=SUCCESS gen=$generation points=${points.size}",
                                )
                                emit(
                                    "onRoutePreviewResult",
                                    mapOf(
                                        "ok" to true,
                                        "pointCount" to points.size,
                                        "distance" to polyLine.distance,
                                    ),
                                )
                            } catch (t: Throwable) {
                                Log.e(tag, "route=APPLY_FAILED gen=$generation", t)
                                clearRouteInternal()
                                emit(
                                    "onRoutePreviewResult",
                                    mapOf(
                                        "ok" to false,
                                        "reason" to t.javaClass.simpleName,
                                    ),
                                )
                            }
                        }
                    }
                },
            )
        } catch (t: Throwable) {
            Log.e(tag, "route=REQUEST_FAILED gen=$generation", t)
            clearRouteInternal()
            emit(
                "onRoutePreviewResult",
                mapOf("ok" to false, "reason" to t.javaClass.simpleName),
            )
        }
    }

    private fun applyRoutePolylinePoints(points: List<Map<String, Any?>>) {
        if (disposed) return
        if (points.size < 2) {
            clearRouteInternal()
            return
        }
        val linePoints = ArrayList<TMapPoint>(points.size)
        for (p in points) {
            val lat = (p["latitude"] as? Number)?.toDouble() ?: continue
            val lng = (p["longitude"] as? Number)?.toDouble() ?: continue
            if (!isValidCoord(lat, lng)) continue
            // Proven ctor order from tmap-sdk-3.7: (latitude, longitude).
            linePoints.add(TMapPoint(lat, lng))
        }
        if (linePoints.size < 2) {
            clearRouteInternal()
            return
        }
        val poly = TMapPolyLine(ROUTE_POLYLINE_ID, linePoints)
        applyNativePolyLine(poly)
    }

    private fun applyNativePolyLine(polyLine: TMapPolyLine) {
        if (disposed) return
        clearRouteInternal()
        polyLine.setID(ROUTE_POLYLINE_ID)
        if (polyLine.lineWidth <= 0f) {
            polyLine.setLineWidth(8f)
        }
        // Keep Delivery Shield layers (pins / driver) above route by default priority.
        mapView.addTMapPolyLine(polyLine)
        routePolylinePresent = true
    }

    private fun clearRouteInternal() {
        if (disposed) return
        try {
            mapView.removeTMapPolyLine(ROUTE_POLYLINE_ID)
        } catch (t: Throwable) {
            Log.w(tag, "removeTMapPolyLine failed", t)
        }
        try {
            mapView.removeTMapPath()
        } catch (t: Throwable) {
            Log.w(tag, "removeTMapPath failed", t)
        }
        routePolylinePresent = false
    }

    private fun resumeMap() {
        if (disposed || resumed) return
        try {
            mapView.onResume()
            resumed = true
            Log.d(tag, "lifecycle=onResume")
            ensureHudWindowsVisible()
        } catch (t: Throwable) {
            Log.e(tag, "lifecycle=onResume failed", t)
        }
    }

    private fun pauseMap() {
        if (disposed || !resumed) return
        try {
            // Keep HUD windows; map pause only. Dismiss happens on PlatformView dispose.
            mapView.onPause()
            resumed = false
            Log.d(tag, "lifecycle=onPause")
        } catch (t: Throwable) {
            Log.e(tag, "lifecycle=onPause failed", t)
        }
    }

    private fun runOnUi(block: () -> Unit) {
        activity.runOnUiThread {
            if (disposed) return@runOnUiThread
            try {
                block()
            } catch (t: Throwable) {
                Log.w(tag, "ui command failed", t)
            }
        }
    }

    private fun emit(method: String, args: Map<String, Any?>) {
        if (disposed) return
        activity.runOnUiThread {
            if (disposed) return@runOnUiThread
            try {
                channel.invokeMethod(method, args)
            } catch (t: Throwable) {
                Log.w(tag, "emit failed method=$method", t)
            }
        }
    }

    private fun sanitizeError(raw: String?): String {
        if (raw.isNullOrBlank()) return ""
        val trimmed = raw.trim()
        return if (trimmed.length > 120) trimmed.take(120) else trimmed
    }

    private fun decodeBitmap(bytes: ByteArray): Bitmap? {
        return try {
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
        } catch (t: Throwable) {
            Log.w(tag, "decodeBitmap failed", t)
            null
        }
    }

    private fun isValidCoord(lat: Double, lng: Double): Boolean {
        return lat.isFinite() && lng.isFinite() && lat != 0.0 && lng != 0.0 &&
            lat in -90.0..90.0 && lng in -180.0..180.0
    }

    @Suppress("UNCHECKED_CAST")
    private fun parsePinList(raw: Any?): List<Map<String, Any?>> {
        val list = raw as? List<*> ?: return emptyList()
        return list.mapNotNull { parsePinMap(it as? Map<*, *>) }
    }

    @Suppress("UNCHECKED_CAST")
    private fun parsePinMap(raw: Map<*, *>?): Map<String, Any?>? {
        if (raw == null) return null
        val id = (raw["markerId"] as? String)?.trim().orEmpty()
        if (id.isEmpty()) return null
        return mapOf(
            "markerId" to id,
            "latitude" to raw["latitude"],
            "longitude" to raw["longitude"],
            "iconBytes" to raw["iconBytes"],
            "selected" to raw["selected"],
            "quantity" to raw["quantity"],
            "visualStatus" to raw["visualStatus"],
        )
    }

    /**
     * Builds HUD widgets hosted in [PopupWindow]s so they sit above VSM's
     * on-top [SurfaceView]. Visual tokens match Flutter UnifiedMapOverlay /
     * MyLocationButton via [TmapHudStyle].
     */
    private fun buildHudWidgets(context: Context) {
        style = TmapHudStyle(context)

        summaryRoot = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.TRANSPARENT)
        }

        hudCard = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            background = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = style.dp(style.cardCornerRadiusDp).toFloat()
                setColor(style.surfaceElevated)
            }
            elevation = style.dp(style.cardElevationDp).toFloat()
            setPadding(
                style.dp(style.cardPaddingStartDp),
                style.dp(style.cardPaddingTopDp),
                style.dp(style.cardPaddingEndDp),
                style.dp(style.cardPaddingBottomDp),
            )
        }

        val header = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }

        hudTitle = TextView(context).apply {
            text = TmapHudStyle.DEFAULT_TITLE
            setTextColor(style.textPrimary)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, style.titleTextSp)
            typeface = style.titleTypeface
            layoutParams = LinearLayout.LayoutParams(
                0,
                LinearLayout.LayoutParams.WRAP_CONTENT,
                1f,
            )
        }
        header.addView(hudTitle)

        val iconBtnSize = style.dp(style.headerIconButtonSizeDp)
        refreshSpinner = ProgressBar(context).apply {
            layoutParams = LinearLayout.LayoutParams(style.dp(18f), style.dp(18f)).apply {
                marginStart = style.dp(style.sm)
                marginEnd = style.dp(style.sm)
                gravity = Gravity.CENTER_VERTICAL
            }
            visibility = View.GONE
            isIndeterminate = true
        }
        header.addView(refreshSpinner)

        refreshBtn = ImageButton(context).apply {
            layoutParams = LinearLayout.LayoutParams(iconBtnSize, iconBtnSize)
            setBackgroundColor(Color.TRANSPARENT)
            setImageResource(R.drawable.ic_ds_refresh)
            scaleType = ImageView.ScaleType.CENTER_INSIDE
            contentDescription = "새로고침"
            setOnClickListener { emit("onRefreshPressed", emptyMap()) }
        }
        header.addView(refreshBtn)

        layersBtn = ImageButton(context).apply {
            layoutParams = LinearLayout.LayoutParams(iconBtnSize, iconBtnSize)
            setBackgroundColor(Color.TRANSPARENT)
            setImageResource(R.drawable.ic_ds_layers)
            scaleType = ImageView.ScaleType.CENTER_INSIDE
            contentDescription = "지도 제공자"
            setOnClickListener { emit("onProviderMenuPressed", emptyMap()) }
        }
        header.addView(layersBtn)

        hudCard.addView(header)

        hudSummaryRow = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, style.dp(style.summaryGapAfterTitleDp), 0, 0)
            visibility = View.GONE
        }
        fun makeStat(initial: String): TextView = TextView(context).apply {
            text = initial
            setTextColor(style.textSecondary)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, style.countTextSp)
            typeface = style.countTypeface
            layoutParams = LinearLayout.LayoutParams(
                0,
                LinearLayout.LayoutParams.WRAP_CONTENT,
                1f,
            )
        }
        hudTotal = makeStat("전체 0")
        hudCompleted = makeStat("완료 0")
        hudRemaining = makeStat("남음 0")
        hudSummaryRow.addView(hudTotal)
        hudSummaryRow.addView(hudCompleted)
        hudSummaryRow.addView(hudRemaining)
        hudCard.addView(hudSummaryRow)

        summaryRoot.addView(
            hudCard,
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ),
        )

        val btnSize = style.dp(style.locationButtonSizeDp)
        myLocationIcon = ImageView(context).apply {
            layoutParams = FrameLayout.LayoutParams(
                style.dp(style.locationIconSizeDp),
                style.dp(style.locationIconSizeDp),
                Gravity.CENTER,
            )
            setImageResource(R.drawable.ic_ds_location_searching)
            scaleType = ImageView.ScaleType.FIT_CENTER
        }
        myLocationBtn = FrameLayout(context).apply {
            layoutParams = ViewGroup.LayoutParams(btnSize, btnSize)
            background = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = style.dp(style.locationCornerRadiusDp).toFloat()
                setColor(style.surfaceElevated)
            }
            elevation = style.dp(style.locationElevationDp).toFloat()
            isClickable = true
            isFocusable = true
            contentDescription = "내 위치"
            setOnClickListener { emit("onMyLocationPressed", emptyMap()) }
            addView(myLocationIcon)
        }
    }

    private fun wireHudLayoutTracking() {
        val listener = ViewTreeObserver.OnGlobalLayoutListener {
            if (disposed) return@OnGlobalLayoutListener
            if (container.width <= 0 || container.height <= 0) return@OnGlobalLayoutListener
            ensureHudWindowsVisible()
        }
        hudLayoutListener = listener
        container.viewTreeObserver.addOnGlobalLayoutListener(listener)
    }

    private fun ensureHudWindowsVisible() {
        if (disposed) return
        if (!container.isAttachedToWindow) return
        if (container.width <= 0 || container.height <= 0) return
        if (!::style.isInitialized) return

        val loc = IntArray(2)
        container.getLocationInWindow(loc)
        val insets = ViewCompat.getRootWindowInsets(container)
        val statusTop = insets?.getInsets(WindowInsetsCompat.Type.statusBars())?.top ?: 0
        val safeTopExtra = if (loc[1] < statusTop) (statusTop - loc[1]) else 0
        val topPad = safeTopExtra + style.dp(style.overlayMarginTopDp)
        val sidePad = style.dp(style.overlayMarginHorizontalDp)
        val summaryWidth = (container.width - sidePad * 2).coerceAtLeast(style.dp(200f))

        if (summaryPopup == null) {
            summaryPopup = PopupWindow(
                summaryRoot,
                summaryWidth,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                false,
            ).apply {
                isOutsideTouchable = false
                isFocusable = false
                isTouchable = true
                setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
                elevation = style.dp(8f).toFloat()
                if (Build.VERSION.SDK_INT >= 29) {
                    isTouchModal = false
                }
            }
        } else {
            summaryPopup?.width = summaryWidth
        }

        val btnSize = style.dp(style.locationButtonSizeDp)
        if (locationPopup == null) {
            locationPopup = PopupWindow(
                myLocationBtn,
                btnSize,
                btnSize,
                false,
            ).apply {
                isOutsideTouchable = false
                isFocusable = false
                isTouchable = true
                setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
                elevation = style.dp(style.locationElevationDp).toFloat()
                if (Build.VERSION.SDK_INT >= 29) {
                    isTouchModal = false
                }
            }
        }

        try {
            val summary = summaryPopup!!
            val x = loc[0] + sidePad
            val y = loc[1] + topPad
            if (summary.isShowing) {
                summary.update(x, y, summaryWidth, ViewGroup.LayoutParams.WRAP_CONTENT, true)
            } else {
                summary.showAtLocation(container, Gravity.NO_GRAVITY, x, y)
            }

            val location = locationPopup!!
            val lx = loc[0] + container.width - btnSize -
                style.dp(style.locationMarginRightDp)
            val ly = loc[1] + container.height - btnSize -
                style.dp(style.locationMarginBottomDp)
            if (location.isShowing) {
                location.update(lx, ly, btnSize, btnSize, true)
            } else {
                location.showAtLocation(container, Gravity.NO_GRAVITY, lx, ly)
            }
        } catch (t: Throwable) {
            Log.w(tag, "tmap hud show failed: ${t.javaClass.simpleName}")
        }
    }

    private fun dismissHudWindows() {
        try {
            summaryPopup?.dismiss()
        } catch (_: Throwable) {
        }
        try {
            locationPopup?.dismiss()
        } catch (_: Throwable) {
        }
        summaryPopup = null
        locationPopup = null
    }

    private fun applyShieldHud(args: Map<String, Any?>?) {
        if (disposed || !::style.isInitialized) return
        val title = (args?.get("title") as? String)?.trim().orEmpty()
            .ifEmpty { TmapHudStyle.DEFAULT_TITLE }
        val showSummary = args?.get("showSummary") as? Boolean ?: true
        val total = (args?.get("totalPoints") as? Number)?.toInt() ?: 0
        val completed = (args?.get("completedPoints") as? Number)?.toInt() ?: 0
        val remaining = (args?.get("remainingPoints") as? Number)?.toInt() ?: 0
        val followActive = args?.get("followActive") as? Boolean ?: false
        val myLocationEnabled = args?.get("myLocationEnabled") as? Boolean ?: true
        val refreshing = args?.get("refreshing") as? Boolean ?: false

        hudTitle.text = title
        hudTotal.text = "전체 $total"
        hudCompleted.text = "완료 $completed"
        hudRemaining.text = "남음 $remaining"
        hudSummaryRow.visibility = if (showSummary) View.VISIBLE else View.GONE

        refreshSpinner.visibility = if (refreshing) View.VISIBLE else View.GONE
        refreshBtn.visibility = if (refreshing) View.GONE else View.VISIBLE

        followActiveVisual = followActive
        myLocationBtn.isEnabled = myLocationEnabled
        myLocationBtn.alpha = if (myLocationEnabled) 1f else 0.45f
        myLocationIcon.setImageResource(
            if (followActive) {
                R.drawable.ic_ds_my_location
            } else {
                R.drawable.ic_ds_location_searching
            },
        )
        val tint = when {
            !myLocationEnabled -> style.textSecondary
            followActive -> style.primary
            else -> style.textPrimary
        }
        myLocationIcon.setColorFilter(tint)

        ensureHudWindowsVisible()
    }

    private fun installSurfaceDemotionWatcher(root: ViewGroup) {
        root.setOnHierarchyChangeListener(object : ViewGroup.OnHierarchyChangeListener {
            override fun onChildViewAdded(parent: View?, child: View?) {
                if (disposed || child == null) return
                demoteIfSurface(child)
                if (child is ViewGroup) {
                    installSurfaceDemotionWatcher(child)
                    for (i in 0 until child.childCount) {
                        demoteIfSurface(child.getChildAt(i))
                    }
                }
                if (mapReadyEmitted) {
                    ensureHudWindowsVisible()
                }
            }

            override fun onChildViewRemoved(parent: View?, child: View?) = Unit
        })
    }

    private fun demoteIfSurface(v: View) {
        if (v !is SurfaceView) return
        try {
            v.setZOrderOnTop(false)
            v.setZOrderMediaOverlay(false)
        } catch (_: Throwable) {
        }
    }

    private fun demoteSurfaceViews(reason: String) {
        fun walk(v: View) {
            if (v is SurfaceView) demoteIfSurface(v)
            if (v is ViewGroup) {
                for (i in 0 until v.childCount) walk(v.getChildAt(i))
            }
        }
        try {
            walk(container)
        } catch (t: Throwable) {
            Log.w(tag, "surface demote failed reason=$reason err=${t.javaClass.simpleName}")
        }
    }

    companion object {
        const val DRIVER_MARKER_ID = "driver-location"
        const val ROUTE_POLYLINE_ID = "ds-route-polyline"
    }
}
