package com.deliveryshield.delivery_shield_mobile

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.os.Build
import android.util.TypedValue

/**
 * Density-aware tokens mirroring Flutter Delivery Shield map HUD:
 * UnifiedMapOverlay, DsCard (Material Card defaults), MyLocationButton,
 * AppSpacing / AppRadius / AppTypography / AppColors / AppTheme.cardTheme.
 */
class TmapHudStyle(private val context: Context) {
    private val density = context.resources.displayMetrics.density

    fun dp(v: Float): Int = (v * density + 0.5f).toInt()

    fun spPx(v: Float): Float = TypedValue.applyDimension(
        TypedValue.COMPLEX_UNIT_SP,
        v,
        context.resources.displayMetrics,
    )

    // AppSpacing
    val xs = 4f
    val sm = 8f
    val md = 16f
    val lg = 20f

    // AppRadius.md
    val radiusMd = 12f

    // AppColors
    val surfaceElevated = Color.parseColor("#152235")
    val textPrimary = Color.parseColor("#F8FAFC")
    val textSecondary = Color.parseColor("#94A3B8")
    val primary = Color.parseColor("#3B82F6")
    val outline = Color.parseColor("#243044")

    // UnifiedMapOverlay outer padding (SafeArea + sm)
    val overlayMarginHorizontalDp = sm
    val overlayMarginTopDp = sm

    // Material Card default margin (Flutter Card) = 4 on all sides
    val cardMarginDp = 4f

    // DsCard padding LTRB: sm, sm, xs, sm
    val cardPaddingStartDp = sm
    val cardPaddingTopDp = sm
    val cardPaddingEndDp = xs
    val cardPaddingBottomDp = sm
    val cardCornerRadiusDp = radiusMd
    val cardElevationDp = 0f

    // titleSmall / labelMedium
    val titleTextSp = 14f
    val countTextSp = 12f
    val summaryGapAfterTitleDp = xs
    val titleTypeface: Typeface = weight600()
    val countTypeface: Typeface = weight600()

    // MyLocationButton: padding md + icon 24
    val locationIconSizeDp = 24f
    val locationPaddingDp = md
    val locationButtonSizeDp = locationPaddingDp * 2 + locationIconSizeDp
    val locationCornerRadiusDp = radiusMd
    val locationElevationDp = 4f
    val locationMarginRightDp = md
    val locationMarginBottomDp = lg

    // Flutter IconButton default min size 48, icon 24
    val headerIconButtonSizeDp = 48f
    val headerIconSizeDp = 24f
    val headerIconPaddingDp = 12f

    private fun weight600(): Typeface {
        return if (Build.VERSION.SDK_INT >= 28) {
            Typeface.create(Typeface.DEFAULT, 600, false)
        } else {
            Typeface.DEFAULT_BOLD
        }
    }

    companion object {
        const val DEFAULT_TITLE = "통합 지도"
    }
}
