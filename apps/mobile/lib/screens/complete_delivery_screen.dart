import 'dart:io';

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

/// Spike: take delivery proof photo then confirm completion.
///
/// Feature flag [AppConfig.completeViaSyncQueue]:
/// - false (default): existing Storage upload + map-spike/complete
/// - true: durable POD_UPLOAD + DELIVERY_COMPLETE queue (optimistic UI)
class CompleteDeliveryScreen extends StatefulWidget {
  const CompleteDeliveryScreen({
    super.key,
    required this.point,
    required this.driverId,
    required this.mapSpikeService,
    this.syncEngine,
    this.completionEnqueue,
    this.projections,
  });

  final MapSpikePoint point;
  final String driverId;
  final MapSpikeService mapSpikeService;
  final OperationSyncEngine? syncEngine;
  final CompletionEnqueueService? completionEnqueue;
  final CompletionProjectionStore? projections;

  @override
  State<CompleteDeliveryScreen> createState() => _CompleteDeliveryScreenState();
}

class _CompleteDeliveryScreenState extends State<CompleteDeliveryScreen> {
  final _picker = ImagePicker();
  XFile? _photo;
  bool _busy = false;
  String? _error;

  bool get _useQueue =>
      AppConfig.instance.completeViaSyncQueue &&
      widget.completionEnqueue != null &&
      widget.syncEngine != null;

  Future<void> _takePhoto() async {
    setState(() => _error = null);
    try {
      final shot = await _picker.pickImage(
        source: ImageSource.camera,
        imageQuality: 85,
        maxWidth: 1600,
      );
      if (!mounted) return;
      setState(() => _photo = shot);
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = '카메라를 열 수 없습니다. 권한을 확인해 주세요.');
    }
  }

  Future<void> _pickFromGallery() async {
    setState(() => _error = null);
    try {
      final shot = await _picker.pickImage(
        source: ImageSource.gallery,
        imageQuality: 85,
        maxWidth: 1600,
      );
      if (!mounted) return;
      setState(() => _photo = shot);
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = '앨범을 열 수 없습니다. 권한을 확인해 주세요.');
    }
  }

  Future<void> _confirm() async {
    final photo = _photo;
    if (photo == null) {
      setState(() => _error = '배송완료 사진을 먼저 촬영해 주세요.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      if (_useQueue) {
        final bytes = await photo.readAsBytes();
        await widget.completionEnqueue!.enqueueCompletion(
          driverId: widget.driverId,
          pointId: widget.point.pointId,
          imageBytes: bytes,
        );
        if (!mounted) return;
        Navigator.of(context).pop({'optimistic': true, 'pointId': widget.point.pointId});
        return;
      }

      final bytes = await photo.readAsBytes();
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

      await widget.mapSpikeService.completeSpike(
        pointId: widget.point.pointId,
        storagePath: path,
        latitude: widget.point.latitude,
        longitude: widget.point.longitude,
      );

      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = e.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = '완료 처리에 실패했습니다.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('배송완료')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              '배송 완료 사진을 촬영한 뒤 확정해 주세요.',
              style: Theme.of(context).textTheme.bodyLarge,
            ),
            const SizedBox(height: 16),
            Expanded(
              child: Container(
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: _photo == null
                    ? const Text('촬영된 사진 없음')
                    : ClipRRect(
                        borderRadius: BorderRadius.circular(12),
                        child: Image.file(
                          File(_photo!.path),
                          fit: BoxFit.contain,
                        ),
                      ),
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ],
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: _busy ? null : _takePhoto,
              icon: const Icon(Icons.photo_camera),
              label: Text(_photo == null ? '사진 촬영' : '다시 촬영'),
            ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: _busy ? null : _pickFromGallery,
              icon: const Icon(Icons.photo_library_outlined),
              label: const Text('앨범에서 선택'),
            ),
            const SizedBox(height: 8),
            FilledButton(
              onPressed: _busy || _photo == null ? null : _confirm,
              child: _busy
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('배송완료 확정'),
            ),
          ],
        ),
      ),
    );
  }
}
