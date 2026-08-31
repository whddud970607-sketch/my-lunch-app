import 'dart:async';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../models/map_spike_point.dart';

/// Shared delivery detail panel — independent of map SDK.
class DeliveryDetailPanel extends StatefulWidget {
  const DeliveryDetailPanel({
    super.key,
    required this.point,
    required this.totalQuantity,
    required this.clusteredJobCount,
    required this.onClose,
    this.onAdjustPin,
    this.onComplete,
    this.onNavigate,
    this.onRevealAccessInfo,
    this.clusterPoints,
    this.onSelectClusterPoint,
  });

  final MapSpikePoint point;
  final int totalQuantity;
  final int clusteredJobCount;
  final VoidCallback onClose;
  final VoidCallback? onAdjustPin;
  final VoidCallback? onComplete;
  final VoidCallback? onNavigate;

  /// Nest GET access-info. Must not log the returned secret.
  final Future<String> Function(String pointId)? onRevealAccessInfo;

  /// Same-location points (visual aggregation only). Identities stay separate.
  final List<MapSpikePoint>? clusterPoints;
  final ValueChanged<MapSpikePoint>? onSelectClusterPoint;

  @override
  State<DeliveryDetailPanel> createState() => _DeliveryDetailPanelState();
}

class _DeliveryDetailPanelState extends State<DeliveryDetailPanel> {
  static const _revealTtl = Duration(seconds: 30);

  bool _accessLoading = false;
  String? _accessPlaintext;
  String? _accessError;
  Timer? _maskTimer;

  @override
  void dispose() {
    _maskTimer?.cancel();
    _accessPlaintext = null;
    super.dispose();
  }

  @override
  void didUpdateWidget(covariant DeliveryDetailPanel oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.point.pointId != widget.point.pointId) {
      _clearAccessReveal();
    }
  }

  void _clearAccessReveal() {
    _maskTimer?.cancel();
    _maskTimer = null;
    _accessPlaintext = null;
    _accessError = null;
    _accessLoading = false;
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
      _maskTimer?.cancel();
      _maskTimer = Timer(_revealTtl, () {
        if (!mounted) return;
        setState(_clearAccessReveal);
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _accessLoading = false;
        _accessError = '출입정보를 불러오지 못했습니다';
      });
    }
  }

  Future<void> _dial() async {
    final value = widget.point.contactValue?.trim();
    if (value == null || value.isEmpty) return;
    final uri = Uri(scheme: 'tel', path: value);
    await launchUrl(uri);
  }

  Future<void> _sms() async {
    final value = widget.point.contactValue?.trim();
    if (value == null || value.isEmpty) return;
    final uri = Uri(scheme: 'sms', path: value);
    await launchUrl(uri);
  }

  void _handleClose() {
    _clearAccessReveal();
    widget.onClose();
  }

  @override
  Widget build(BuildContext context) {
    final point = widget.point;
    final bottom = MediaQuery.paddingOf(context).bottom;
    final theme = Theme.of(context);

    return Material(
      elevation: 12,
      borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
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
            padding: EdgeInsets.fromLTRB(16, 8, 8, 16 + bottom),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    margin: const EdgeInsets.only(bottom: 8),
                    decoration: BoxDecoration(
                      color: theme.dividerColor,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        '배송지 상세',
                        style: theme.textTheme.titleLarge,
                      ),
                    ),
                    IconButton(
                      tooltip: '닫기',
                      onPressed: _handleClose,
                      icon: const Icon(Icons.close),
                    ),
                  ],
                ),
                if (_showClusterPicker) ...[
                  const SizedBox(height: 4),
                  Text('같은 위치의 배송', style: theme.textTheme.titleSmall),
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
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
                  const SizedBox(height: 8),
                ],
                if (_contextLine(point) != null) ...[
                  Text(
                    _contextLine(point)!,
                    style: theme.textTheme.bodySmall,
                  ),
                  const SizedBox(height: 6),
                ],
                const SizedBox(height: 4),
                _row(context, '고객', point.customerName),
                _row(context, '주소', point.address),
                _row(context, '상세주소', point.detailAddress),
                if ((point.deliveryMemo ?? '').trim().isNotEmpty)
                  _row(context, '배송메모', point.deliveryMemo!.trim()),
                const SizedBox(height: 12),
                Text('출입정보', style: theme.textTheme.titleSmall),
                const SizedBox(height: 6),
                if (point.piiMasked || point.isCompleted)
                  Text(
                    '완료 배송지는 출입정보를 표시하지 않습니다',
                    style: theme.textTheme.bodyMedium,
                  )
                else if (!point.hasAccessInfo)
                  Text(
                    '등록된 출입정보 없음',
                    style: theme.textTheme.bodyMedium,
                  )
                else ...[
                  OutlinedButton(
                    onPressed: _accessLoading ? null : _toggleAccess,
                    child: Text(
                      _accessPlaintext != null ? '출입정보 숨기기' : '출입정보 보기',
                    ),
                  ),
                  if (_accessLoading)
                    const Padding(
                      padding: EdgeInsets.only(top: 8),
                      child: LinearProgressIndicator(),
                    ),
                  if (_accessError != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Text(
                        _accessError!,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.error,
                        ),
                      ),
                    ),
                  if (_accessPlaintext != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Semantics(
                        label: '출입정보 표시됨',
                        child: Text(
                          _accessPlaintext!,
                          style: theme.textTheme.titleMedium,
                        ),
                      ),
                    ),
                ],
                const SizedBox(height: 12),
                Text('배송 물품', style: theme.textTheme.titleSmall),
                const SizedBox(height: 4),
                _row(context, '상품', point.product),
                _row(context, '총 수량', '${widget.totalQuantity}개'),
                if (widget.clusteredJobCount > 1)
                  _row(context, '묶음', '${widget.clusteredJobCount}건 동일 위치'),
                const SizedBox(height: 6),
                Text('송장 목록', style: theme.textTheme.labelLarge),
                const SizedBox(height: 4),
                if (point.shipments.isEmpty)
                  Text(
                    '등록된 송장코드 없음',
                    style: theme.textTheme.bodySmall,
                  )
                else
                  ...point.shipments.map(
                    (s) => Semantics(
                      label: '송장 ${s.trackingCode} ${s.status}',
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 2),
                        child: Row(
                          children: [
                            Text(
                              '${s.sequenceNo}. ',
                              style: const TextStyle(fontWeight: FontWeight.w600),
                            ),
                            Expanded(child: Text(s.trackingCode)),
                            Text(
                              s.status,
                              style: theme.textTheme.bodySmall,
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                if (point.shipments.isNotEmpty &&
                    point.shipments.length != widget.totalQuantity)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(
                      '주의: 송장 ${point.shipments.length}건 ≠ 수량 ${widget.totalQuantity}',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.error,
                      ),
                    ),
                  ),
                const SizedBox(height: 12),
                Text('고객 연락', style: theme.textTheme.titleSmall),
                const SizedBox(height: 6),
                if (!point.canContact)
                  Text(
                    point.piiMasked || point.isCompleted
                        ? '완료 후 연락처는 사용할 수 없습니다'
                        : '등록된 연락처 없음',
                    style: theme.textTheme.bodyMedium,
                  )
                else ...[
                  _row(context, '연락처', point.contactValue ?? ''),
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: _dial,
                          icon: const Icon(Icons.phone),
                          label: const Text('전화하기'),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: _sms,
                          icon: const Icon(Icons.sms_outlined),
                          label: const Text('문자하기'),
                        ),
                      ),
                    ],
                  ),
                ],
                const SizedBox(height: 16),
                Row(
                  children: [
                    if (widget.onNavigate != null)
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: widget.onNavigate,
                          icon: const Icon(Icons.navigation_outlined),
                          label: const Text('길안내'),
                        ),
                      ),
                    if (widget.onNavigate != null && widget.onComplete != null)
                      const SizedBox(width: 8),
                    if (widget.onComplete != null)
                      Expanded(
                        child: FilledButton.icon(
                          onPressed:
                              point.isCompleted ? null : widget.onComplete,
                          icon: const Icon(Icons.check_circle_outline),
                          label: const Text('배송완료'),
                        ),
                      ),
                  ],
                ),
                if (widget.onAdjustPin != null && !point.isCompleted) ...[
                  const SizedBox(height: 8),
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

  Widget _row(BuildContext context, String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 72,
            child: Text(
              label,
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ),
          Expanded(child: Text(value)),
        ],
      ),
    );
  }

  bool get _showClusterPicker =>
      (widget.clusterPoints?.length ?? 0) > 1 &&
      widget.onSelectClusterPoint != null;

  String _clusterChipLabel(MapSpikePoint p) {
    final parts = <String>[];
    final src = (p.sourceLabel ?? '').trim();
    if (src.isNotEmpty) parts.add(src);
    final product = p.product.trim();
    if (product.isNotEmpty) {
      parts.add(product);
    } else {
      parts.add('qty ${p.quantity}');
    }
    return parts.join(' · ');
  }

  String? _contextLine(MapSpikePoint point) {
    final parts = <String>[];
    final company = (point.companyLabel ?? '').trim();
    if (company.isNotEmpty) parts.add(company);
    final source = (point.sourceLabel ?? '').trim();
    if (source.isNotEmpty) parts.add(source);
    if (parts.isEmpty) return null;
    return parts.join(' · ');
  }
}
