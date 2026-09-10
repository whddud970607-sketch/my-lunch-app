package com.deliveryshield.delivery_shield_mobile

import android.app.Activity
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.PointF
import android.util.Log
import android.view.View
import android.widget.FrameLayout
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import com.skt.tmap.TMapPoint
import com.skt.tmap.TMapView
import com.skt.tmap.overlay.TMapMarkerItem
import com.skt.tmap.poi.TMapPOIItem
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import io.flutter.plugin.platform.PlatformView
import java.util.ArrayList
import java.util.concurrent.ConcurrentHashMap

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
        container.addView(mapView)
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
        Log.i(tag, "state=DISPOSED")
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

    private fun resumeMap() {
        if (disposed || resumed) return
        try {
            mapView.onResume()
            resumed = true
            Log.d(tag, "lifecycle=onResume")
        } catch (t: Throwable) {
            Log.e(tag, "lifecycle=onResume failed", t)
        }
    }

    private fun pauseMap() {
        if (disposed || !resumed) return
        try {
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

    companion object {
        const val DRIVER_MARKER_ID = "driver-location"
    }
}
