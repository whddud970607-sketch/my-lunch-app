package com.deliveryshield.delivery_shield_mobile

/**
 * Dev-only POC toggles for isolation tests.
 */
object KakaoNaviPocConfig {
    const val MARKERS_ENABLED = true
    /** 1 = isolation test B; 10 = full fixture; 0 = all deliveries in fixture. */
    const val MARKER_COUNT_LIMIT = 10
    const val USE_TUTORIAL_ROUTE = false
    const val MARKER_CLICK_ENABLED = true
}
