import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../config/app_config.dart';
import '../models/map_spike_point.dart';
import '../services/api_exception.dart';
import '../services/map_spike_service.dart';
import '../sync/completion_enqueue_service.dart';
import '../sync/completion_projection_store.dart';
import '../sync/operation_sync_engine.dart';
import '../theme/app_colors.dart';
import '../theme/app_radius.dart';
import '../theme/app_spacing.dart';
import '../theme/app_typography.dart';
import '../widgets/ds_card.dart';
import '../widgets/ds_primary_button.dart';
import '../widgets/ds_status_badge.dart';
import 'complete_delivery_data.dart';
import 'complete_delivery_keys.dart';

typedef CompleteDeliverySubmitHook = Future<CompleteSubmitKind> Function(
  List<int> imageBytes,
);

/// Existing complete + POD screen. Authoritative submit stays enqueue or map-spike.
class CompleteDeliveryScreen extends StatefulWidget {
  const CompleteDeliveryScreen({
    super.key,
    required this.point,
    required this.driverId,
    this.mapSpikeService,
    this.syncEngine,
    this.completionEnqueue,
    this.projections,
    this.nextPoint,
    this.onOpenMap,
    this.onOpenList,
    this.shipmentCount,
    this.submitHook,
    this.seedPhotoBytes,
  }) : assert(
          mapSpikeService != null || submitHook != null,
          'mapSpikeService or submitHook required',
        );

  final MapSpikePoint point;
  final String driverId;
  final MapSpikeService? mapSpikeService;
  final OperationSyncEngine? syncEngine;
  final CompletionEnqueueService? completionEnqueue;
  final CompletionProjectionStore? projections;
  final MapSpikePoint? nextPoint;
  final VoidCallback? onOpenMap;
  final VoidCallback? onOpenList;
  final int? shipmentCount;
  final CompleteDeliverySubmitHook? submitHook;
  final List<int>? seedPhotoBytes;

  @override
  State<CompleteDeliveryScreen> createState() => _CompleteDeliveryScreenState();
}

class _CompleteDeliveryScreenState extends State<CompleteDeliveryScreen> {
  final _picker = ImagePicker();
  XFile? _photo;
  List<int>? _seedBytes;
  bool _busy = false;
  String? _error;
  CompleteUiPhase _phase = CompleteUiPhase.idle;

  bool get _useQueue =>
      AppConfig.instance.completeViaSyncQueue &&
      widget.completionEnqueue != null &&
      widget.syncEngine != null;

  bool get _hasPhoto => _photo != null || _seedBytes != null;

  @override
  void initState() {
    super.initState();
    _seedBytes = widget.seedPhotoBytes;
  }

  Future<Uint8List> _photoBytes() async {
    if (_seedBytes != null) return Uint8List.fromList(_seedBytes!);
    return _photo!.readAsBytes();
  }

  Future<void> _takePhoto() async {
    if (completeSubmitBlocked(_phase)) return;
    setState(() => _error = null);
    try {
      final shot = await _picker.pickImage(
        source: ImageSource.camera,
        imageQuality: 85,
        maxWidth: 1600,
      );
      if (!mounted) return;
      setState(() {
        _photo = shot;
        if (shot != null) _seedBytes = null;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = '카메라를 열 수 없습니다. 권한을 확인해 주세요.');
    }
  }

  Future<void> _pickFromGallery() async {
    if (completeSubmitBlocked(_phase)) return;
    setState(() => _error = null);
    try {
      final shot = await _picker.pickImage(
        source: ImageSource.gallery,
        imageQuality: 85,
        maxWidth: 1600,
      );
      if (!mounted) return;
      setState(() {
        _photo = shot;
        if (shot != null) _seedBytes = null;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = '앨범을 열 수 없습니다. 권한을 확인해 주세요.');
    }
  }

  Future<void> _confirm() async {
    if (completeSubmitBlocked(_phase) || _busy) return;
    if (!_hasPhoto) {
      setState(() {
        _error = '배송완료 사진을 먼저 촬영해 주세요.';
        _phase = CompleteUiPhase.error;
      });
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
      _phase = CompleteUiPhase.submitting;
    });
    try {
      final bytes = await _photoBytes();
      final hook = widget.submitHook;
      if (hook != null) {
        final kind = await hook(bytes);
        if (!mounted) return;
        setState(() {
          _busy = false;
          _phase = kind == CompleteSubmitKind.queued
              ? CompleteUiPhase.offlineQueued
              : CompleteUiPhase.success;
        });
        return;
      }

      if (_useQueue) {
        await widget.completionEnqueue!.enqueueCompletion(
          driverId: widget.driverId,
          pointId: widget.point.pointId,
          imageBytes: bytes,
        );
        if (!mounted) return;
        setState(() {
          _busy = false;
          _phase = CompleteUiPhase.offlineQueued;
        });
        return;
      }

      final name = '${DateTime.now().millisecondsSinceEpoch}.jpg';
      final path = '${widget.driverId}/${widget.point.pointId}/$name';
      final storage = Supabase.instance.client.storage.from('delivery-proofs');
      await storage.uploadBinary(
        path,
        bytes,
        fileOptions: const FileOptions(
          contentType: 'image/jpeg',
          upsert: false,
        ),
      );

      await widget.mapSpikeService!.completeSpike(
        pointId: widget.point.pointId,
        storagePath: path,
        latitude: widget.point.latitude,
        longitude: widget.point.longitude,
      );

      if (!mounted) return;
      setState(() {
        _busy = false;
        _phase = CompleteUiPhase.success;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = e.message;
        _phase = CompleteUiPhase.error;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = '완료 처리에 실패했습니다.';
        _phase = CompleteUiPhase.error;
      });
    }
  }

  void _finish(CompleteNavAction action) {
    final queued = _phase == CompleteUiPhase.offlineQueued;
    final confirmed = _phase == CompleteUiPhase.success;
    Navigator.of(context).pop(
      CompleteFlowResult(
        queued: queued,
        confirmed: confirmed,
        action: action,
        nextPointId: action == CompleteNavAction.next
            ? widget.nextPoint?.pointId
            : null,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final done = _phase == CompleteUiPhase.success ||
        _phase == CompleteUiPhase.offlineQueued;
    return Scaffold(
      appBar: AppBar(
        title: const Text('배송 완료'),
        automaticallyImplyLeading: !done,
      ),
      body: SafeArea(
        child: done ? _buildResult() : _buildForm(),
      ),
    );
  }

  Widget _buildForm() {
    final header = completePointHeader(widget.point);
    final counts = completeCountsLine(
      point: widget.point,
      shipmentCount: widget.shipmentCount,
    );
    final submitting = _phase == CompleteUiPhase.submitting;
    final canSubmit = _hasPhoto && !completeSubmitBlocked(_phase) && !_busy;

    return ListView(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.lg,
        AppSpacing.md,
        AppSpacing.lg,
        AppSpacing.xxl,
      ),
      children: [
        DsCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                header,
                key: CompleteDeliveryKeys.header,
                style: AppTypography.textTheme.titleLarge,
              ),
              const SizedBox(height: AppSpacing.sm),
              const DsStatusBadge(
                label: '미완료',
                tone: DsStatusTone.active,
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                counts,
                key: CompleteDeliveryKeys.counts,
                style: AppTypography.textTheme.bodyMedium,
              ),
              Text(
                '물량 ${widget.point.quantity}',
                key: CompleteDeliveryKeys.quantity,
                style: AppTypography.textTheme.bodySmall,
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        DsCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('완료 사진', style: AppTypography.textTheme.titleMedium),
              const SizedBox(height: AppSpacing.xs),
              Text(
                '필수 · 카메라 또는 앨범',
                style: AppTypography.textTheme.bodySmall,
              ),
              const SizedBox(height: AppSpacing.md),
              Container(
                key: CompleteDeliveryKeys.podPhoto,
                height: 180,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(AppRadius.md),
                  border: Border.all(color: AppColors.outline),
                ),
                child: _photo != null
                    ? ClipRRect(
                        borderRadius: BorderRadius.circular(AppRadius.md),
                        child: Image.file(
                          File(_photo!.path),
                          fit: BoxFit.contain,
                          height: 180,
                          width: double.infinity,
                        ),
                      )
                    : Text(
                        _hasPhoto ? '사진 선택됨' : '촬영된 사진 없음',
                        style: AppTypography.textTheme.bodyMedium,
                      ),
              ),
              const SizedBox(height: AppSpacing.md),
              OutlinedButton.icon(
                key: CompleteDeliveryKeys.podCamera,
                onPressed: submitting ? null : _takePhoto,
                icon: const Icon(Icons.photo_camera),
                label: Text(_hasPhoto ? '다시 촬영' : '사진 촬영'),
              ),
              const SizedBox(height: AppSpacing.sm),
              OutlinedButton.icon(
                key: CompleteDeliveryKeys.podGallery,
                onPressed: submitting ? null : _pickFromGallery,
                icon: const Icon(Icons.photo_library_outlined),
                label: const Text('앨범에서 선택'),
              ),
            ],
          ),
        ),
        if (_error != null) ...[
          const SizedBox(height: AppSpacing.md),
          Text(
            _error!,
            key: CompleteDeliveryKeys.error,
            style: AppTypography.textTheme.bodyMedium?.copyWith(
              color: AppColors.danger,
            ),
          ),
        ],
        const SizedBox(height: AppSpacing.lg),
        DsPrimaryButton(
          key: CompleteDeliveryKeys.submit,
          label: '완료',
          busy: submitting,
          onPressed: canSubmit ? _confirm : null,
        ),
        if (submitting)
          const SizedBox(
            key: CompleteDeliveryKeys.loading,
            height: 0,
          ),
        const SizedBox(height: AppSpacing.sm),
        OutlinedButton(
          key: CompleteDeliveryKeys.cancel,
          onPressed: submitting ? null : () => Navigator.of(context).pop(),
          child: const Text('취소'),
        ),
      ],
    );
  }

  Widget _buildResult() {
    final queued = _phase == CompleteUiPhase.offlineQueued;
    final next = widget.nextPoint;
    return ListView(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.lg,
        AppSpacing.xl,
        AppSpacing.lg,
        AppSpacing.xxl,
      ),
      children: [
        Icon(
          queued ? Icons.cloud_upload_outlined : Icons.check_circle_outline,
          color: queued ? AppColors.warning : AppColors.success,
          size: 56,
        ),
        const SizedBox(height: AppSpacing.md),
        Text(
          queued ? '오프라인 저장됨 / 연결 시 동기화' : '배송을 완료했습니다',
          key: queued
              ? CompleteDeliveryKeys.offlineQueued
              : CompleteDeliveryKeys.success,
          style: AppTypography.textTheme.titleLarge,
        ),
        const SizedBox(height: AppSpacing.sm),
        Text(
          queued
              ? '서버 완료 전입니다. 연결되면 기존 대기열에서 동기화됩니다.'
              : completePointHeader(widget.point),
          style: AppTypography.textTheme.bodyMedium,
        ),
        const SizedBox(height: AppSpacing.xl),
        if (next != null)
          DsPrimaryButton(
            key: CompleteDeliveryKeys.nextDelivery,
            label: '다음 배송',
            onPressed: () => _finish(CompleteNavAction.next),
          )
        else
          Text(
            '남은 다음 배송이 없습니다',
            style: AppTypography.textTheme.bodySmall,
          ),
        if (widget.onOpenMap != null) ...[
          const SizedBox(height: AppSpacing.sm),
          OutlinedButton(
            key: CompleteDeliveryKeys.openMap,
            onPressed: () => _finish(CompleteNavAction.map),
            child: const Text('지도 보기'),
          ),
        ],
        if (widget.onOpenList != null) ...[
          const SizedBox(height: AppSpacing.sm),
          OutlinedButton(
            key: CompleteDeliveryKeys.openList,
            onPressed: () => _finish(CompleteNavAction.list),
            child: const Text('배송 목록'),
          ),
        ],
        const SizedBox(height: AppSpacing.sm),
        OutlinedButton(
          key: CompleteDeliveryKeys.done,
          onPressed: () => _finish(CompleteNavAction.close),
          child: const Text('닫기'),
        ),
      ],
    );
  }
}
