package com.deliveryshield.delivery_shield_mobile

import com.kakaomobility.knsdk.common.gps.WGS84ToKATEC
import org.json.JSONObject

/**
 * Runtime delivery list for product in-app nav (or null → fixture PoC).
 */
object KakaoNaviPocDeliverySource {
    @Volatile
    var productDeliveries: List<KakaoNaviPocDelivery>? = null
        private set

    @Volatile
    var productStartLatitude: Double? = null
        private set

    @Volatile
    var productStartLongitude: Double? = null
        private set

    @Volatile
    var productDestinationNumber: Int? = null
        private set

    @Volatile
    var initiallyCompletedNumbers: Set<Int> = emptySet()
        private set

    @Volatile
    var isProductSession: Boolean = false
        private set

    fun clear() {
        productDeliveries = null
        productStartLatitude = null
        productStartLongitude = null
        productDestinationNumber = null
        initiallyCompletedNumbers = emptySet()
        isProductSession = false
    }

    fun activeDeliveries(): List<KakaoNaviPocDelivery> {
        return productDeliveries ?: KakaoNaviPocDeliveryFixture.deliveries
    }

    fun destination(): KakaoNaviPocDelivery {
        val number = productDestinationNumber
        val list = productDeliveries
        if (list != null && number != null) {
            return list.firstOrNull { it.deliveryNumber == number } ?: list.first()
        }
        return KakaoNaviPocDeliveryFixture.destination
    }

    fun applySessionJson(sessionJson: String?) {
        clear()
        if (sessionJson.isNullOrBlank()) return
        val root = JSONObject(sessionJson)
        val stops = root.getJSONArray("stops")
        val built = ArrayList<KakaoNaviPocDelivery>(stops.length())
        val completed = mutableSetOf<Int>()
        for (i in 0 until stops.length()) {
            val stop = stops.getJSONObject(i)
            val delivery = deliveryFromStopJson(stop)
            built.add(delivery)
            if (stop.optBoolean("isCompleted", false) ||
                stop.optString("statusCode", "") == "completed"
            ) {
                completed.add(delivery.deliveryNumber)
            }
        }
        if (built.isEmpty()) return
        productDeliveries = built
        productDestinationNumber = root.optInt("destinationNumber", built.first().deliveryNumber)
        initiallyCompletedNumbers = completed
        if (root.has("startLatitude") && !root.isNull("startLatitude") &&
            root.has("startLongitude") && !root.isNull("startLongitude")
        ) {
            productStartLatitude = root.getDouble("startLatitude")
            productStartLongitude = root.getDouble("startLongitude")
        }
        isProductSession = true
    }

    private fun deliveryFromStopJson(stop: JSONObject): KakaoNaviPocDelivery {
        val latitude = stop.getDouble("latitude")
        val longitude = stop.getDouble("longitude")
        // WGS84: x = longitude, y = latitude → KATEC via KNSDK helper.
        val katec = WGS84ToKATEC(longitude, latitude)
        val address = stop.optString("address", "")
        val detail = stop.optString("detailAddress", "")
        val product = stop.optString("product", stop.optString("name", "배송지"))
        val customer = stop.optString("customerName", "")
        return KakaoNaviPocDelivery(
            deliveryNumber = stop.getInt("deliveryNumber"),
            complex = address.ifBlank { product },
            roadAddress = address,
            buildingDong = detail,
            unit = "",
            name = customer.ifBlank { product },
            phone = "",
            accessCode = "",
            product = product,
            quantity = stop.optInt("quantity", 1),
            request = "",
            latitude = latitude,
            longitude = longitude,
            katecX = katec.x.toFloat(),
            katecY = katec.y.toFloat(),
            provenance = CoordinateProvenance.VERIFIED_BUILDING_COORDINATE,
        )
    }
}
