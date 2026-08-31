package com.deliveryshield.delivery_shield_mobile

import android.app.Activity
import android.view.View
import android.widget.Button
import android.widget.ImageButton
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AlertDialog

/**
 * Dev-only compact/expanded delivery action panel overlay on KNNaviView.
 * Does not change navigation destination or route.
 */
class KakaoNaviPocActionPanelController(
    private val activity: Activity,
    private val sessionState: KakaoNaviPocSessionState,
    private val onCompleteConfirmed: (KakaoNaviPocDelivery) -> Unit,
) {
    private var panel: View? = null
    private var expanded = false

    fun bind(panelView: View) {
        panel = panelView
        panelView.findViewById<ImageButton>(R.id.btn_panel_close).setOnClickListener { hide() }
        panelView.findViewById<Button>(R.id.btn_panel_expand).setOnClickListener { expand() }
        panelView.findViewById<Button>(R.id.btn_panel_collapse).setOnClickListener { collapse() }
        panelView.findViewById<Button>(R.id.btn_panel_complete).setOnClickListener {
            val delivery = sessionState.selectedDeliveryPoint ?: return@setOnClickListener
            if (sessionState.isCompleted(delivery.deliveryNumber)) return@setOnClickListener
            showCompleteConfirmation(delivery)
        }
    }

    fun show(delivery: KakaoNaviPocDelivery) {
        sessionState.select(delivery)
        collapse()
        bindContent(delivery)
        panel?.visibility = View.VISIBLE
        KakaoNaviPocDiagnostics.actionPanelShown(delivery.deliveryNumber, expanded = false)
    }

    fun refresh() {
        val delivery = sessionState.selectedDeliveryPoint ?: return
        bindContent(delivery)
    }

    fun hide() {
        panel?.visibility = View.GONE
        collapse()
        sessionState.clearSelection()
        KakaoNaviPocDiagnostics.actionPanelShown(deliveryNumber = -1, expanded = false, visible = false)
    }

    private fun expand() {
        expanded = true
        panel?.findViewById<ScrollView>(R.id.panel_expanded_scroll)?.visibility = View.VISIBLE
        sessionState.selectedDeliveryPoint?.let {
            KakaoNaviPocDiagnostics.actionPanelShown(it.deliveryNumber, expanded = true)
        }
    }

    private fun collapse() {
        expanded = false
        panel?.findViewById<ScrollView>(R.id.panel_expanded_scroll)?.visibility = View.GONE
        sessionState.selectedDeliveryPoint?.let {
            KakaoNaviPocDiagnostics.actionPanelShown(it.deliveryNumber, expanded = false)
        }
    }

    private fun bindContent(delivery: KakaoNaviPocDelivery) {
        val panelView = panel ?: return
        val completed = sessionState.isCompleted(delivery.deliveryNumber)
        val status = sessionState.statusOf(delivery.deliveryNumber)

        panelView.findViewById<TextView>(R.id.tv_panel_title).text =
            "${delivery.deliveryNumber}번 배송"
        panelView.findViewById<TextView>(R.id.tv_compact_address).text =
            "${delivery.complex} ${delivery.buildingDong} ${delivery.unit}"
        panelView.findViewById<TextView>(R.id.tv_compact_product).text =
            "${delivery.product} × ${delivery.quantity}"

        val completedLabel = panelView.findViewById<TextView>(R.id.tv_compact_completed)
        val actionRow = panelView.findViewById<View>(R.id.panel_action_row)
        val completeButton = panelView.findViewById<Button>(R.id.btn_panel_complete)
        val expandButton = panelView.findViewById<Button>(R.id.btn_panel_expand)

        if (completed) {
            completedLabel.visibility = View.VISIBLE
            completeButton.visibility = View.GONE
            panelView.findViewById<TextView>(R.id.tv_compact_address).visibility = View.GONE
            panelView.findViewById<TextView>(R.id.tv_compact_product).visibility = View.GONE
            expandButton.visibility = View.VISIBLE
            actionRow.visibility = View.VISIBLE
        } else {
            completedLabel.visibility = View.GONE
            completeButton.visibility = View.VISIBLE
            panelView.findViewById<TextView>(R.id.tv_compact_address).visibility = View.VISIBLE
            panelView.findViewById<TextView>(R.id.tv_compact_product).visibility = View.VISIBLE
            actionRow.visibility = View.VISIBLE
        }

        panelView.findViewById<TextView>(R.id.tv_detail_number).text =
            "배송번호: ${delivery.deliveryNumber}번"
        panelView.findViewById<TextView>(R.id.tv_detail_customer).text =
            "고객명: ${delivery.name} [SYNTHETIC]"
        panelView.findViewById<TextView>(R.id.tv_detail_road_address).text =
            "도로명주소: ${delivery.roadAddress}"
        panelView.findViewById<TextView>(R.id.tv_detail_complex).text =
            "단지명: ${delivery.complex}"
        panelView.findViewById<TextView>(R.id.tv_detail_building).text =
            "동: ${delivery.buildingDong}"
        panelView.findViewById<TextView>(R.id.tv_detail_unit).text =
            "호: ${delivery.unit}"
        panelView.findViewById<TextView>(R.id.tv_detail_product).text =
            "상품명: ${delivery.product}"
        panelView.findViewById<TextView>(R.id.tv_detail_quantity).text =
            "수량: ${delivery.quantity}"
        panelView.findViewById<TextView>(R.id.tv_detail_request).text = delivery.request
        panelView.findViewById<TextView>(R.id.tv_detail_status).text =
            "현재 배송상태: ${statusLabel(status)}"
    }

    private fun statusLabel(status: KakaoNaviPocDeliveryStatus): String {
        return when (status) {
            KakaoNaviPocDeliveryStatus.PENDING -> "PENDING"
            KakaoNaviPocDeliveryStatus.COMPLETED -> "COMPLETED"
        }
    }

    private fun showCompleteConfirmation(delivery: KakaoNaviPocDelivery) {
        KakaoNaviPocDiagnostics.deliveryCompleteConfirmationShown(delivery.deliveryNumber)
        AlertDialog.Builder(activity)
            .setMessage("${delivery.deliveryNumber}번 배송을 완료 처리할까요?")
            .setNegativeButton("취소") { dialog, _ ->
                dialog.dismiss()
                KakaoNaviPocDiagnostics.deliveryCompleteCancelled(delivery.deliveryNumber)
            }
            .setPositiveButton("배송완료") { dialog, _ ->
                dialog.dismiss()
                if (!sessionState.isCompleted(delivery.deliveryNumber)) {
                    onCompleteConfirmed(delivery)
                }
            }
            .show()
    }
}
