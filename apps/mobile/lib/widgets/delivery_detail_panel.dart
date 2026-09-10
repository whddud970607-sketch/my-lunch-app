import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import '../models/map_spike_point.dart';
import '../screens/delivery_detail_data.dart';
import '../screens/delivery_detail_keys.dart';
import '../theme/app_colors.dart';
import '../theme/app_radius.dart';
import '../theme/app_spacing.dart';
import '../theme/app_typography.dart';
import 'ds_card.dart';
import 'ds_primary_button.dart';
import 'ds_status_badge.dart';

/// Shared Point-centric delivery detail. Map and list reuse this panel.
class DeliveryDetailPanel extends StatefulWidget {
  const DeliveryDetailPanel({
    super.key,
    required this.point,
    required this.totalQuantity,
    required this.clusteredJobCount,
    required this.onClose,
    this.shipmentCount,
    this.onAdjustPin,
    this.onComplete,
    this.onNavigate,
    this.onRevealAccessInfo,
    this.onHydratePoint,
    this.clusterPoints,
    this.onSelectClusterPoint,
  });

  final MapSpikePoint point;
  final int totalQuantity;
  final int clusteredJobCount;
  final int? shipmentCount;
  final VoidCallback onClose;
  final VoidCallback? onAdjustPin;
  final VoidCallback? onComplete;
  final VoidCallback? onNavigate;

  /// Nest GET access-info. Must not log the returned secret.
  final Future<String> Function(String pointId)? onRevealAccessInfo;

  /// Optional existing point-detail fetch. Failures stay on operational data.
  final Future<MapSpikePoint> Function(String pointId)? onHydratePoint;

  /// Same-location points (visual aggregation only). Identities stay separate.
  final List<MapSpikePoint>? clusterPoints;
  final ValueChanged<MapSpikePoint>? onSelectClusterPoint;

  @override
  State<DeliveryDetailPanel> createState() => _DeliveryDetailPanelState();
}

class _DeliveryDetailPanelState extends State<DeliveryDetailPanel> {
  bool _accessLoading = false;
  String? _accessPlaintext;
  String? _accessError;
  Timer? _accessMaskTimer;

  bool _phoneRevealed = false;
  Timer? _phoneMaskTimer;

  MapSpikePoint? _hydrated;

  MapSpikePoint get _point => _hydrated ?? widget.point;

  @override
  void initState() {
    super.initState();
    unawaited(_hydrate());
  }

  @override
  void dispose() {
    _accessMaskTimer?.cancel();
    _phoneMaskTimer?.cancel();
    _accessPlaintext = null;
    super.dispose();
  }

  @override
  void didUpdateWidget(covariant DeliveryDetailPanel oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.point.pointId != widget.point.pointId) {
      _hydrated = null;
      _clearAccessReveal();
      _clearPhoneReveal();
      unawaited(_hydrate());
    }
  }

  Future<void> _hydrate() async {
    final fetch = widget.onHydratePoint;
    if (fetch == null) return;
    try {
      final rich = await fetch(widget.point.pointId);
      if (!mounted) return;
      setState(() {
        _hydrated = mergeHydratedDetail(widget.point, rich);
      });
    } catch (_) {
      // Keep operational point; do not block the sheet.
    }
  }

  void _clearAccessReveal() {
    _accessMaskTimer?.cancel();
    _accessMaskTimer = null;
    _accessPlaintext = null;
    _accessError = null;
    _accessLoading = false;
  }

  void _clearPhoneReveal() {
    _phoneMaskTimer?.cancel();
    _phoneMaskTimer = null;
    _phoneRevealed = false;
  }

  Future<void> _toggleAccess() async {
    if (_accessPlaintext != null) {
      setState(_clearAccessReveal);
      return;
    }
    final fetch = widget.onRevealAccessInfo;
    if (fetch == null) return;
    setState(() {
      _accessLoading = true;
      _accessError = null;
    });
    try {
      final value = await fetch(widget.point.pointId);
      if (!mounted) return;
      setState(() {
        _accessPlaintext = value;
        _accessLoading = false;
      });
      _accessMaskTimer?.cancel();
      _accessMaskTimer = Timer(detailRevealTtl, () {
        if (!mounted) return;
        setState(_clearAccessReveal);
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _accessLoading = false;
        _accessError = '공동현관 비밀번호를 불러오지 못했습니다';
      });
    }
  }

  void _togglePhone() {
    if (_phoneRevealed) {
      setState(_clearPhoneReveal);
      return;
    }
    if (!detailShowPhoneActions(_point)) return;
    setState(() => _phoneRevealed = true);
    _phoneMaskTimer?.cancel();
    _phoneMaskTimer = Timer(detailRevealTtl, () {
      if (!mounted) return;
      setState(_clearPhoneReveal);
    });
  }

  Future<void> _dial() async {
    final value = _point.contactValue?.trim();
    if (value == null || value.isEmpty) return;
    await launchUrl(Uri(scheme: 'tel', path: value));
  }

  Future<void> _sms() async {
    final value = _point.contactValue?.trim();
    if (value == null || value.isEmpty) return;
    await launchUrl(Uri(scheme: 'sms', path: value));
  }

  Future<void> _copyAddress() async {
    final value = detailAddressLine(_point);
    if (value == null) return;
    await Clipboard.setData(ClipboardData(text: value));
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(const SnackBar(content: Text('주소를 복사했습니다')));
  }

  void _handleClose() {
    _clearAccessReveal();
    _clearPhoneReveal();
    widget.onClose();
  }

  bool get _showClusterPicker =>
      (widget.clusterPoints?.length ?? 0) > 1 &&
      widget.onSelectClusterPoint != null;

  String _clusterChipLabel(MapSpikePoint p) {
    final parts = <String>[];
    final src = (p.sourceLabel ?? '').trim();
    if (src.isNotEmpty) parts.add(src);
    final product = p.product.trim();
    if (!isMaskedOrEmpty(product)) {
      parts.add(product);
    } else {
      parts.add('물량 ${p.quantity}');
    }
    return parts.join(' · ');
  }

  @override
  Widget build(BuildContext context) {
    final point = _point;
    final bottom = MediaQuery.paddingOf(context).bottom;
    final completed = point.isCompleted;
    final canNavigate = widget.onNavigate != null && detailCanNavigate(point);
    final showComplete = widget.onComplete != null && detailShowComplete(point);
    final deliveryCount = detailDeliveryCount(
      point: point,
      shipmentCount: widget.shipmentCount,
      clusteredJobCount: widget.clusteredJobCount,
    );
    final company = detailCompanyLabel(point);
    final source = detailSourceLabel(point);
    final address = detailAddressLine(point);
    final addressDetail = detailAddressDetailLine(point);
    final memo = detailMemoLine(point);
    final shipments = detailShipments(point);
    final phoneValue = point.contactValue?.trim();

    return Material(
      color: AppColors.surfaceElevated,
      elevation: 12,
      borderRadius: const BorderRadius.vertical(
        top: Radius.circular(AppRadius.lg),
      ),
      clipBehavior: Clip.antiAlias,
      child: SafeArea(
        top: false,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onVerticalDragEnd: (details) {
            if ((details.primaryVelocity ?? 0) > 200) {
              _handleClose();
            }
          },
          child: SingleChildScrollView(
            padding: EdgeInsets.fromLTRB(
              AppSpacing.md,
              AppSpacing.sm,
              AppSpacing.sm,
              AppSpacing.md + bottom,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    margin: const EdgeInsets.only(bottom: AppSpacing.sm),
                    decoration: BoxDecoration(
                      color: AppColors.outline,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Text(
                        detailPointHeader(point),
                        key: DeliveryDetailKeys.header,
                        style: AppTypography.textTheme.titleLarge,
                      ),
                    ),
                    DsStatusBadge(
                      key: DeliveryDetailKeys.status,
                      label: detailStatusLabel(point),
                      tone: completed
                          ? DsStatusTone.success
                          : DsStatusTone.active,
                    ),
                    IconButton(
                      tooltip: '닫기',
                      onPressed: _handleClose,
                      icon: const Icon(Icons.close),
                    ),
                  ],
                ),
                if (_showClusterPicker) ...[
                  const SizedBox(height: AppSpacing.sm),
                  Text('같은 위치의 배송', style: AppTypography.textTheme.titleSmall),
                  const SizedBox(height: AppSpacing.xs),
                  Wrap(
                    spacing: AppSpacing.sm,
                    runSpacing: AppSpacing.sm,
                    children: [
                      for (final p in widget.clusterPoints!)
                        ChoiceChip(
                          selected: p.pointId == point.pointId,
                          label: Text(_clusterChipLabel(p)),
                          onSelected: (_) =>
                              widget.onSelectClusterPoint?.call(p),
                        ),
                    ],
                  ),
                ],
                const SizedBox(height: AppSpacing.md),
                DsCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        '배송 $deliveryCount건 · 물량 ${widget.totalQuantity}',
                        key: DeliveryDetailKeys.counts,
                        style: AppTypography.textTheme.titleSmall,
                      ),
                      if (widget.clusteredJobCount > 1) ...[
                        const SizedBox(height: AppSpacing.xs),
                        Text(
                          '같은 위치 ${widget.clusteredJobCount}건',
                          style: AppTypography.textTheme.bodySmall,
                        ),
                      ],
                      if (company != null) ...[
                        const SizedBox(height: AppSpacing.sm),
                        Text(
                          '회사  $company',
                          key: DeliveryDetailKeys.company,
                          style: AppTypography.textTheme.bodyMedium,
                        ),
                      ],
                      if (source != null) ...[
                        const SizedBox(height: AppSpacing.xs),
                        Text(
                          '소스  $source',
                          key: DeliveryDetailKeys.source,
                          style: AppTypography.textTheme.bodyMedium,
                        ),
                      ],
                    ],
                  ),
                ),
                if (address != null) ...[
                  const SizedBox(height: AppSpacing.sm),
                  DsCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text('주소', style: AppTypography.textTheme.titleSmall),
                        const SizedBox(height: AppSpacing.xs),
                        Text(
                          address,
                          key: DeliveryDetailKeys.address,
                          style: AppTypography.textTheme.bodyMedium,
                        ),
                        if (addressDetail != null) ...[
                          const SizedBox(height: AppSpacing.xs),
                          Text(
                            addressDetail,
                            style: AppTypography.textTheme.bodySmall,
                          ),
                        ],
                        const SizedBox(height: AppSpacing.sm),
                        OutlinedButton(
                          key: DeliveryDetailKeys.addressCopy,
                          onPressed: _copyAddress,
                          child: const Text('주소 복사'),
                        ),
                      ],
                    ),
                  ),
                ],
                if (memo != null) ...[
                  const SizedBox(height: AppSpacing.sm),
                  DsCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text('배송메모', style: AppTypography.textTheme.titleSmall),
                        const SizedBox(height: AppSpacing.xs),
                        Text(memo, style: AppTypography.textTheme.bodyMedium),
                      ],
                    ),
                  ),
                ],
                if (detailHasShipmentRows(point)) ...[
                  const SizedBox(height: AppSpacing.sm),
                  DsCard(
                    child: Column(
                      key: DeliveryDetailKeys.shipments,
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(
                          '배송 물량',
                          style: AppTypography.textTheme.titleSmall,
                        ),
                        const SizedBox(height: AppSpacing.xs),
                        for (final s in shipments)
                          Padding(
                            padding: const EdgeInsets.symmetric(
                              vertical: AppSpacing.xs,
                            ),
                            child: Row(
                              children: [
                                Text(
                                  '${s.sequenceNo}. ',
                                  style: AppTypography.textTheme.labelLarge,
                                ),
                                Expanded(
                                  child: Text(
                                    s.trackingCode,
                                    style: AppTypography.textTheme.bodyMedium,
                                  ),
                                ),
                                Text(
                                  s.status,
                                  style: AppTypography.textTheme.bodySmall,
                                ),
                              ],
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
                if (detailShowAccessReveal(point)) ...[
                  const SizedBox(height: AppSpacing.sm),
                  DsCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(
                          '공동현관 비밀번호',
                          style: AppTypography.textTheme.titleSmall,
                        ),
                        const SizedBox(height: AppSpacing.sm),
                        Material(
                          color: AppColors.surface,
                          elevation: 3,
                          shadowColor: Colors.black54,
                          borderRadius: BorderRadius.circular(AppRadius.md),
                          child: InkWell(
                            key: DeliveryDetailKeys.accessReveal,
                            borderRadius: BorderRadius.circular(AppRadius.md),
                            onTap: _accessLoading ? null : _toggleAccess,
                            child: Ink(
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(
                                  AppRadius.md,
                                ),
                                border: Border.all(
                                  color: AppColors.outline,
                                  width: 1.2,
                                ),
                                color: AppColors.surface,
                              ),
                              child: ConstrainedBox(
                                constraints: const BoxConstraints(
                                  minHeight: 56,
                                ),
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: AppSpacing.md,
                                    vertical: AppSpacing.md,
                                  ),
                                  child: Row(
                                    children: [
                                      Icon(
                                        _accessPlaintext != null
                                            ? Icons.lock_open_rounded
                                            : Icons.lock_outline_rounded,
                                        color: AppColors.primary,
                                        size: 22,
                                      ),
                                      const SizedBox(width: AppSpacing.sm),
                                      Expanded(
                                        child: Text(
                                          _accessPlaintext != null
                                              ? '비밀번호 숨기기'
                                              : '공동현관 비밀번호 보기',
                                          style: AppTypography
                                              .textTheme
                                              .titleSmall
                                              ?.copyWith(
                                                color: AppColors.textPrimary,
                                                fontWeight: FontWeight.w600,
                                              ),
                                        ),
                                      ),
                                      Icon(
                                        _accessPlaintext != null
                                            ? Icons.visibility_off_outlined
                                            : Icons.visibility_outlined,
                                        color: AppColors.textSecondary,
                                        size: 20,
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                        if (_accessLoading)
                          const Padding(
                            padding: EdgeInsets.only(top: AppSpacing.sm),
                            child: LinearProgressIndicator(),
                          ),
                        if (_accessError != null)
                          Padding(
                            padding: const EdgeInsets.only(top: AppSpacing.sm),
                            child: Text(
                              _accessError!,
                              style: AppTypography.textTheme.bodySmall
                                  ?.copyWith(color: AppColors.danger),
                            ),
                          ),
                        if (_accessPlaintext != null)
                          Padding(
                            padding: const EdgeInsets.only(top: AppSpacing.sm),
                            child: Semantics(
                              label: '공동현관 비밀번호 표시됨',
                              child: Container(
                                width: double.infinity,
                                padding: const EdgeInsets.all(AppSpacing.md),
                                decoration: BoxDecoration(
                                  color: AppColors.background,
                                  borderRadius: BorderRadius.circular(
                                    AppRadius.sm,
                                  ),
                                  border: Border.all(color: AppColors.outline),
                                ),
                                child: Text(
                                  _accessPlaintext!,
                                  key: DeliveryDetailKeys.accessValue,
                                  style: AppTypography.textTheme.titleMedium
                                      ?.copyWith(
                                        letterSpacing: 0.5,
                                        fontWeight: FontWeight.w600,
                                      ),
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ] else if (detailShowCompletedAccessPolicy(point)) ...[
                  const SizedBox(height: AppSpacing.sm),
                  Text(
                    '완료 배송지는 공동현관 비밀번호를 표시하지 않습니다',
                    style: AppTypography.textTheme.bodySmall,
                  ),
                ],
                if (detailShowPhoneActions(point)) ...[
                  const SizedBox(height: AppSpacing.sm),
                  DsCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(
                          '고객 연락',
                          style: AppTypography.textTheme.titleSmall,
                        ),
                        const SizedBox(height: AppSpacing.sm),
                        OutlinedButton(
                          key: DeliveryDetailKeys.phoneReveal,
                          onPressed: _togglePhone,
                          child: Text(_phoneRevealed ? '연락처 숨기기' : '연락처 보기'),
                        ),
                        if (_phoneRevealed &&
                            phoneValue != null &&
                            phoneValue.isNotEmpty)
                          Padding(
                            padding: const EdgeInsets.only(top: AppSpacing.sm),
                            child: Text(
                              phoneValue,
                              key: DeliveryDetailKeys.phoneValue,
                              style: AppTypography.textTheme.titleMedium,
                            ),
                          ),
                        const SizedBox(height: AppSpacing.sm),
                        Row(
                          children: [
                            Expanded(
                              child: OutlinedButton(
                                key: DeliveryDetailKeys.callAction,
                                onPressed: _dial,
                                child: const Text('전화'),
                              ),
                            ),
                            const SizedBox(width: AppSpacing.sm),
                            Expanded(
                              child: OutlinedButton(
                                key: DeliveryDetailKeys.smsAction,
                                onPressed: _sms,
                                child: const Text('문자'),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
                const SizedBox(height: AppSpacing.lg),
                if (canNavigate)
                  DsPrimaryButton(
                    key: DeliveryDetailKeys.navigate,
                    label: '길찾기',
                    onPressed: widget.onNavigate,
                  ),
                if (canNavigate && showComplete)
                  const SizedBox(height: AppSpacing.sm),
                if (showComplete)
                  DsPrimaryButton(
                    key: DeliveryDetailKeys.complete,
                    label: '배송 완료',
                    onPressed: widget.onComplete,
                  ),
                if (widget.onAdjustPin != null && !completed) ...[
                  const SizedBox(height: AppSpacing.sm),
                  TextButton(
                    onPressed: widget.onAdjustPin,
                    child: const Text('핀 위치 조정'),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
