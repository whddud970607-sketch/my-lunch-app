package com.deliveryshield.delivery_shield_mobile

/**
 * Independent POC session state for navigation vs selection vs completion.
 *
 * Selecting or completing a delivery does not change [navigationDestination].
 */
class KakaoNaviPocSessionState(
    val navigationDestination: KakaoNaviPocDelivery,
    initiallyCompleted: Set<Int> = emptySet(),
) {
    var selectedDeliveryPoint: KakaoNaviPocDelivery? = null
        private set

    private val completedNumbers = initiallyCompleted.toMutableSet()

    val completedDeliveryPoints: Set<Int>
        get() = completedNumbers.toSet()

    fun select(delivery: KakaoNaviPocDelivery) {
        selectedDeliveryPoint = delivery
    }

    fun clearSelection() {
        selectedDeliveryPoint = null
    }

    fun statusOf(deliveryNumber: Int): KakaoNaviPocDeliveryStatus {
        return if (completedNumbers.contains(deliveryNumber)) {
            KakaoNaviPocDeliveryStatus.COMPLETED
        } else {
            KakaoNaviPocDeliveryStatus.PENDING
        }
    }

    fun markCompleted(deliveryNumber: Int): Boolean {
        if (completedNumbers.contains(deliveryNumber)) return false
        completedNumbers.add(deliveryNumber)
        return true
    }

    fun isCompleted(deliveryNumber: Int): Boolean = completedNumbers.contains(deliveryNumber)
}
