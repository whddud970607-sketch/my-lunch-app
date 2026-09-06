package com.deliveryshield.delivery_shield_mobile

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import com.kakaomobility.knsdk.common.util.FloatPoint
import com.kakaomobility.knsdk.map.knmapview.KNMapView
import com.kakaomobility.knsdk.map.knmapview.idl.KNMarkerEventListener
import com.kakaomobility.knsdk.map.uicustomsupport.renewal.KNMapMarker

fun interface KakaoNaviPocMarkerTapListener {
    fun onDeliveryMarkerSelected(delivery: KakaoNaviPocDelivery)
}

/**
 * Renders numbered delivery markers on the KNNaviView navigation map (KNMapView API).
 *
 * Does not call bindingMapView or replace the navigation map renderer.
 * Avoids removeMarkersAll() so KNNaviView internal overlays are not cleared.
 * Chains KNMarkerEventListener to preserve any listener KNNaviView already registered.
 */
class KakaoNaviPocMarkerHelper(
    private val context: Context,
) : KNMarkerEventListener {

    private val placedMarkers = mutableListOf<KNMapMarker>()
    private val markerByNumber = mutableMapOf<Int, KNMapMarker>()
    private var mapView: KNMapView? = null
    private var markersAttached = false
    private var preservedListener: KNMarkerEventListener? = null
    private var tapListener: KakaoNaviPocMarkerTapListener? = null
    private var navigationDestinationNumber = 1
    private val completedNumbers = mutableSetOf<Int>()

    fun setOnDeliveryMarkerTapListener(listener: KakaoNaviPocMarkerTapListener?) {
        tapListener = listener
    }

    fun setNavigationDestinationNumber(deliveryNumber: Int) {
        navigationDestinationNumber = deliveryNumber
        refreshAllMarkerVisuals()
    }

    fun markDeliveryCompleted(deliveryNumber: Int) {
        if (!completedNumbers.add(deliveryNumber)) return
        markerByNumber[deliveryNumber]?.let { marker ->
            marker.icon = createMarkerIcon(deliveryNumber)
            KakaoNaviPocDiagnostics.markerVisualUpdated(deliveryNumber, completed = true)
        }
    }

    fun refreshAllMarkerVisuals() {
        markerByNumber.forEach { (number, marker) ->
            marker.icon = createMarkerIcon(number)
        }
    }

    fun attachToNavigationMap(mapView: KNMapView) {
        if (markersAttached && this.mapView === mapView) return
        clearMarkers()
        this.mapView = mapView
        val markers = buildDeliveryMarkers()
        var listenerAttached = false
        try {
            val existing = mapView.knMarkerEventListener
            if (existing != null && existing !== this) {
                preservedListener = existing
                KakaoNaviPocDiagnostics.markerListenerPreserved(existing.javaClass.simpleName)
            }
            mapView.addMarkers(markers)
            placedMarkers.addAll(markers)
            markerByNumber.clear()
            markers.forEach { marker ->
                val delivery = marker.info as? KakaoNaviPocDelivery
                if (delivery != null) {
                    markerByNumber[delivery.deliveryNumber] = marker
                }
            }
            if (KakaoNaviPocConfig.MARKER_CLICK_ENABLED) {
                mapView.knMarkerEventListener = this
                listenerAttached = true
            }
            markersAttached = true
            scheduleMarkerScreenDiagnostics(mapView)
            KakaoNaviPocDiagnostics.markerAttach(
                requested = markers.size,
                completed = placedMarkers.size,
                listenerAttached = listenerAttached,
            )
        } catch (error: Throwable) {
            KakaoNaviPocDiagnostics.caught("marker_attach", error)
            clearMarkers()
        }
    }

    fun clearMarkers() {
        val view = mapView
        if (view != null) {
            placedMarkers.forEach { marker ->
                try {
                    view.removeMarker(marker)
                } catch (error: Throwable) {
                    KakaoNaviPocDiagnostics.caught("marker_remove", error)
                }
            }
            if (KakaoNaviPocConfig.MARKER_CLICK_ENABLED) {
                val restore = preservedListener
                if (restore != null) {
                    view.knMarkerEventListener = restore
                }
            }
        }
        placedMarkers.clear()
        markerByNumber.clear()
        completedNumbers.clear()
        preservedListener = null
        markersAttached = false
    }

    private fun selectedDeliveries(): List<KakaoNaviPocDelivery> {
        val all = KakaoNaviPocDeliverySource.activeDeliveries()
        // Product in-app nav must keep every workset pin; PoC limit is fixture-only.
        if (KakaoNaviPocDeliverySource.isProductSession) return all
        return when {
            KakaoNaviPocConfig.MARKER_COUNT_LIMIT <= 0 -> all
            else -> all.take(KakaoNaviPocConfig.MARKER_COUNT_LIMIT)
        }
    }

    private fun buildDeliveryMarkers(): List<KNMapMarker> {
        return selectedDeliveries().map { delivery ->
            val marker = KNMapMarker(FloatPoint(delivery.katecX, delivery.katecY))
            marker.icon = createMarkerIcon(delivery.deliveryNumber)
            marker.info = delivery
            marker.tag = delivery.deliveryNumber
            marker.priority = 100 + delivery.deliveryNumber
            marker.isVisible = true
            marker.useSingleTapped = true
            marker
        }
    }

    private fun createMarkerIcon(number: Int): Bitmap {
        val isDestination = number == navigationDestinationNumber && !completedNumbers.contains(number)
        val isCompleted = completedNumbers.contains(number)
        return when {
            isCompleted -> createCompletedIcon(number)
            isDestination -> createNumberedIcon(number, isDestination = true)
            else -> createNumberedIcon(number, isDestination = false)
        }
    }

    private fun createCompletedIcon(number: Int): Bitmap {
        val sizePx = (44 * context.resources.displayMetrics.density).toInt().coerceAtLeast(44)
        val bitmap = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        val rect = RectF(4f, 4f, sizePx - 4f, sizePx - 4f)
        val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#757575")
            style = Paint.Style.FILL
        }
        val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            style = Paint.Style.STROKE
            strokeWidth = 3f
        }
        canvas.drawRoundRect(rect, sizePx / 4f, sizePx / 4f, fillPaint)
        canvas.drawRoundRect(rect, sizePx / 4f, sizePx / 4f, strokePaint)
        val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            textAlign = Paint.Align.CENTER
            textSize = sizePx * 0.34f
            isFakeBoldText = true
        }
        val label = "$number✓"
        val textY = sizePx / 2f - (textPaint.descent() + textPaint.ascent()) / 2f
        canvas.drawText(label, sizePx / 2f, textY, textPaint)
        return bitmap
    }

    private fun createNumberedIcon(number: Int, isDestination: Boolean): Bitmap {
        val sizePx = (44 * context.resources.displayMetrics.density).toInt().coerceAtLeast(44)
        val bitmap = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        val rect = RectF(4f, 4f, sizePx - 4f, sizePx - 4f)
        val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = if (isDestination) Color.parseColor("#FF6D00") else Color.parseColor("#1565C0")
            style = Paint.Style.FILL
        }
        val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            style = Paint.Style.STROKE
            strokeWidth = 3f
        }
        canvas.drawRoundRect(rect, sizePx / 4f, sizePx / 4f, fillPaint)
        canvas.drawRoundRect(rect, sizePx / 4f, sizePx / 4f, strokePaint)
        val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            textAlign = Paint.Align.CENTER
            textSize = sizePx * 0.42f
            isFakeBoldText = true
        }
        val textY = sizePx / 2f - (textPaint.descent() + textPaint.ascent()) / 2f
        canvas.drawText(number.toString(), sizePx / 2f, textY, textPaint)
        return bitmap
    }

    private fun resolveDelivery(marker: KNMapMarker): KakaoNaviPocDelivery? {
        (marker.info as? KakaoNaviPocDelivery)?.let { return it }
        val tag = marker.tag
        if (tag > 0) {
            return KakaoNaviPocDeliverySource.activeDeliveries()
                .firstOrNull { it.deliveryNumber == tag }
        }
        return null
    }

    override fun onCalloutBubbleSelected(
        mapView: KNMapView?,
        marker: KNMapMarker,
    ) {
        preservedListener?.onCalloutBubbleSelected(mapView, marker)
    }

    override fun onSingleTapped(
        mapView: KNMapView?,
        marker: KNMapMarker,
    ) {
        KakaoNaviPocDiagnostics.markerTapRaw(marker.id, marker.tag)
        val delivery = resolveDelivery(marker)
        if (delivery != null && placedMarkers.contains(marker)) {
            KakaoNaviPocDiagnostics.markerTapped(delivery.deliveryNumber)
            tapListener?.onDeliveryMarkerSelected(delivery)
        }
        preservedListener?.onSingleTapped(mapView, marker)
    }

    private fun scheduleMarkerScreenDiagnostics(mapView: KNMapView) {
        val deliveries = selectedDeliveries()
        mapView.postDelayed({ logMarkerScreenPositions(mapView, deliveries, pass = 1) }, 3_000L)
        mapView.postDelayed({ logMarkerScreenPositions(mapView, deliveries, pass = 2) }, 8_000L)
    }

    private fun logMarkerScreenPositions(
        mapView: KNMapView,
        deliveries: List<KakaoNaviPocDelivery>,
        pass: Int,
    ) {
        val width = mapView.width.coerceAtLeast(1)
        val height = mapView.height.coerceAtLeast(1)
        deliveries.forEach { delivery ->
            try {
                val screen = mapView.katecToScreen(FloatPoint(delivery.katecX, delivery.katecY))
                val onScreen = screen.x in 0f..width.toFloat() && screen.y in 0f..height.toFloat()
                KakaoNaviPocDiagnostics.markerScreenPosition(
                    deliveryNumber = delivery.deliveryNumber,
                    screenX = screen.x,
                    screenY = screen.y,
                    onScreen = onScreen,
                    pass = pass,
                )
            } catch (error: Throwable) {
                KakaoNaviPocDiagnostics.caught("marker_screen_position", error)
            }
        }
    }

    override fun onDoubleTapped(
        mapView: KNMapView?,
        marker: KNMapMarker,
    ) {
        preservedListener?.onDoubleTapped(mapView, marker)
    }

    override fun onLongPressed(
        mapView: KNMapView?,
        marker: KNMapMarker,
    ) {
        preservedListener?.onLongPressed(mapView, marker)
    }

    override fun onMarkerAnimateEnded(
        mapView: KNMapView?,
        marker: KNMapMarker,
    ) {
        preservedListener?.onMarkerAnimateEnded(mapView, marker)
    }
}
