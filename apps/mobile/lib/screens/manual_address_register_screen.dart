import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../copy/driver_chrome_copy.dart';
import '../models/manual_address_candidate.dart';
import '../services/api_exception.dart';
import '../services/invoice_evidence_image.dart';
import '../services/manual_address_repository.dart';
import '../theme/app_spacing.dart';
import '../widgets/ds_primary_button.dart';
import 'manual_address_keys.dart';
import 'manual_address_register_data.dart';
import 'manual_pin_adjust_screen.dart';

enum _ManualPhase { search, confirm }

enum _SearchPhase { idle, loading, zero, error }

class ManualAddressRegisterScreen extends StatefulWidget {
  const ManualAddressRegisterScreen({
    super.key,
    required this.repository,
    this.serviceDate,
    this.idempotency,
    this.reason = ManualRegisterReason.manualEntry,
    this.invoiceEvidenceRequirement,
    this.pickInvoice,
    this.debounce = const Duration(milliseconds: 400),
  });

  final ManualAddressRepository repository;
  final String? serviceDate;
  final ManualRegisterIdempotency? idempotency;
  final ManualRegisterReason reason;
  final InvoiceEvidenceRequirement? invoiceEvidenceRequirement;
  final Future<InvoiceEvidenceDraft?> Function(ImageSource source)? pickInvoice;
  final Duration debounce;

  @override
  State<ManualAddressRegisterScreen> createState() =>
      _ManualAddressRegisterScreenState();
}

class _ManualAddressRegisterScreenState
    extends State<ManualAddressRegisterScreen> {
  late final ManualRegisterIdempotency _idempotency =
      widget.idempotency ?? ManualRegisterIdempotency();
  final _searchController = TextEditingController();
  final _detailController = TextEditingController();
  final _dongController = TextEditingController();
  final _unitController = TextEditingController();
  final _quantityController =
      TextEditingController(text: '${defaultManualQuantity()}');
  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _picker = ImagePicker();

  _ManualPhase _phase = _ManualPhase.search;
  _SearchPhase _searchPhase = _SearchPhase.idle;
  List<ManualAddressCandidate> _hits = const [];
  ManualAddressCandidate? _selected;
  bool _submitting = false;
  bool _submitLock = false;
  String? _submitError;
  bool _offline = false;
  ManualRegisterResult? _success;
  ManualPinSelection? _pin;
  InvoiceEvidenceDraft _invoice = const InvoiceEvidenceDraft();
  Timer? _debounce;

  @override
  void dispose() {
    _debounce?.cancel();
    _searchController.dispose();
    _detailController.dispose();
    _dongController.dispose();
    _unitController.dispose();
    _quantityController.dispose();
    _nameController.dispose();
    _phoneController.dispose();
    super.dispose();
  }

  void _onQueryChanged(String raw) {
    _debounce?.cancel();
    final q = raw.trim();
    if (q.length < 2) {
      setState(() {
        _searchPhase = _SearchPhase.idle;
        _hits = const [];
      });
      return;
    }
    setState(() => _searchPhase = _SearchPhase.loading);
    _debounce = Timer(widget.debounce, () => _runSearch(q));
  }

  Future<void> _runSearch(String query) async {
    try {
      final hits = await widget.repository.suggest(query);
      if (!mounted || _searchController.text.trim() != query) return;
      setState(() {
        _hits = hits;
        _searchPhase =
            hits.isEmpty ? _SearchPhase.zero : _SearchPhase.idle;
        _offline = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _searchPhase = _SearchPhase.error;
        _offline = isOfflineManualFailure(e);
        _hits = const [];
      });
    }
  }

  void _selectCandidate(ManualAddressCandidate hit) {
    final base = manualRegisterCoordinateFields(hit);
    setState(() {
      _selected = hit;
      _phase = _ManualPhase.confirm;
      _submitError = null;
      _success = null;
      _pin = base.isEmpty
          ? null
          : ManualPinSelection(
              latitude: base['latitude']!,
              longitude: base['longitude']!,
              source: ManualPinSource.baseAddress,
            );
    });
  }

  Future<void> _openPinAdjust() async {
    final current = _pin;
    if (current == null) return;
    final next = await Navigator.of(context).push<ManualPinSelection>(
      MaterialPageRoute(
        builder: (_) => ManualPinAdjustScreen(initial: current),
      ),
    );
    if (!mounted || next == null) return;
    setState(() => _pin = next);
  }

  Future<void> _captureInvoice(ImageSource source) async {
    try {
      final injected = widget.pickInvoice;
      if (injected != null) {
        final draft = await injected(source);
        if (!mounted || draft == null || !draft.hasLocalImage) return;
        _applyInvoiceBytes(draft.bytes!, draft.capturedAt ?? DateTime.now());
        return;
      }
      final shot = await _picker.pickImage(
        source: source,
        imageQuality: invoiceEvidenceJpegQuality,
        maxWidth: invoiceEvidenceMaxWidth.toDouble(),
      );
      if (!mounted || shot == null) return;
      _applyInvoiceBytes(await shot.readAsBytes(), DateTime.now());
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _submitError = DriverChromeCopy.manualInvoiceRejected;
      });
    }
  }

  void _applyInvoiceBytes(List<int> raw, DateTime capturedAt) {
    try {
      final prepared = prepareInvoiceEvidenceBytes(raw);
      setState(() {
        _submitError = null;
        _invoice = InvoiceEvidenceDraft(
          bytes: prepared.bytes,
          capturedAt: capturedAt,
          status: InvoiceEvidenceUploadStatus.ready,
        );
      });
    } on InvoiceEvidenceImageException {
      setState(() {
        _submitError = DriverChromeCopy.manualInvoiceRejected;
      });
    }
  }

  void _removeInvoice() {
    setState(() {
      _invoice = const InvoiceEvidenceDraft();
    });
  }

  String _invoiceStatusLabel() {
    switch (_invoice.status) {
      case InvoiceEvidenceUploadStatus.uploading:
        return DriverChromeCopy.manualInvoiceUploading;
      case InvoiceEvidenceUploadStatus.uploaded:
        return DriverChromeCopy.manualInvoiceUploaded;
      case InvoiceEvidenceUploadStatus.failed:
        return DriverChromeCopy.manualInvoiceUploadFailed;
      case InvoiceEvidenceUploadStatus.ready:
      case InvoiceEvidenceUploadStatus.none:
        return DriverChromeCopy.manualInvoiceCaptured;
    }
  }

  Future<void> _submit() async {
    final selected = _selected;
    if (selected == null || _submitLock) return;
    final qty = normalizeManualQuantity(_quantityController.text);
    if (qty < 0) {
      setState(() {
        _submitError = DriverChromeCopy.manualRegisterBadQuantity;
        _offline = false;
      });
      return;
    }
    setState(() {
      _submitLock = true;
      _submitting = true;
      _submitError = null;
      _offline = false;
    });
    final key = _idempotency.key;
    try {
      final result = await widget.repository.register(
        commitIdempotencyKey: key,
        candidate: selected,
        detailAddress: _detailController.text.trim(),
        dong: _dongController.text.trim(),
        unit: _unitController.text.trim(),
        recipientName: _nameController.text,
        recipientPhone: _phoneController.text,
        pin: _pin,
        quantity: qty,
        serviceDate: widget.serviceDate,
        reason: widget.reason,
      );
      if (!mounted) return;
      if (result.ok &&
          (result.resultCode == 'applied' || result.resultCode == 'duplicate')) {
        var evidenceFailed = false;
        if (_invoice.hasLocalImage && result.pointId != null) {
          evidenceFailed = !await _uploadEvidence(result.pointId!);
          if (!mounted) return;
        }
        setState(() {
          _submitting = false;
          _success = result;
        });
        if (evidenceFailed) {
          return;
        }
        if (Navigator.of(context).canPop()) {
          Navigator.of(context).pop(result);
        }
        return;
      }
      setState(() {
        _submitLock = false;
        _submitting = false;
        _submitError = DriverChromeCopy.manualRegisterFailed;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _submitLock = false;
        _submitting = false;
        _offline = e.statusCode == null || isOfflineManualFailure(e);
        _submitError = manualRegisterErrorMessage(e);
      });
    } catch (e) {
      if (!mounted) return;
      final offline = isOfflineManualFailure(e);
      setState(() {
        _submitLock = false;
        _submitting = false;
        _offline = offline;
        _submitError = manualRegisterErrorMessage(e);
      });
    }
  }

  Future<bool> _uploadEvidence(String pointId) async {
    final bytes = _invoice.bytes;
    if (bytes == null || bytes.isEmpty) return true;
    setState(() {
      _invoice = InvoiceEvidenceDraft(
        bytes: bytes,
        capturedAt: _invoice.capturedAt,
        status: InvoiceEvidenceUploadStatus.uploading,
      );
    });
    try {
      final uploaded = await widget.repository.uploadInvoiceEvidence(
        pointId: pointId,
        bytes: bytes,
        capturedAt: _invoice.capturedAt,
        reason: widget.reason,
      );
      if (!mounted) return uploaded.ok;
      setState(() {
        _invoice = InvoiceEvidenceDraft(
          bytes: bytes,
          capturedAt: _invoice.capturedAt,
          status: uploaded.ok
              ? InvoiceEvidenceUploadStatus.uploaded
              : InvoiceEvidenceUploadStatus.failed,
        );
        if (!uploaded.ok) {
          _submitError = DriverChromeCopy.manualInvoiceUploadFailed;
        }
      });
      return uploaded.ok;
    } on ApiException catch (e) {
      if (!mounted) return false;
      setState(() {
        _invoice = InvoiceEvidenceDraft(
          bytes: bytes,
          capturedAt: _invoice.capturedAt,
          status: InvoiceEvidenceUploadStatus.failed,
        );
        _submitError = manualRegisterErrorMessage(e);
      });
      return false;
    } catch (e) {
      if (!mounted) return false;
      setState(() {
        _invoice = InvoiceEvidenceDraft(
          bytes: bytes,
          capturedAt: _invoice.capturedAt,
          status: InvoiceEvidenceUploadStatus.failed,
        );
        _submitError = isOfflineManualFailure(e)
            ? DriverChromeCopy.manualOffline
            : DriverChromeCopy.manualInvoiceUploadFailed;
      });
      return false;
    }
  }

  Future<void> _retryEvidence() async {
    final pointId = _success?.pointId;
    if (pointId == null || _invoice.status == InvoiceEvidenceUploadStatus.uploading) {
      return;
    }
    setState(() => _submitError = null);
    final ok = await _uploadEvidence(pointId);
    if (!mounted || !ok) return;
    if (Navigator.of(context).canPop()) {
      Navigator.of(context).pop(_success);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: ManualAddressKeys.screen,
      appBar: AppBar(
        title: Text(
          _phase == _ManualPhase.search
              ? DriverChromeCopy.manualSearchTitle
              : DriverChromeCopy.manualConfirmTitle,
        ),
        leading: _phase == _ManualPhase.confirm
            ? IconButton(
                icon: const Icon(Icons.arrow_back),
                onPressed: _submitting
                    ? null
                    : () => setState(() => _phase = _ManualPhase.search),
              )
            : null,
      ),
      body: _phase == _ManualPhase.search ? _buildSearch() : _buildConfirm(),
    );
  }

  Widget _buildSearch() {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(AppSpacing.md),
          child: TextField(
            key: ManualAddressKeys.searchField,
            controller: _searchController,
            textInputAction: TextInputAction.search,
            decoration: const InputDecoration(
              hintText: DriverChromeCopy.manualSearchHint,
            ),
            onChanged: _onQueryChanged,
          ),
        ),
        Expanded(child: _buildSearchBody()),
      ],
    );
  }

  Widget _buildSearchBody() {
    if (_searchPhase == _SearchPhase.loading) {
      return const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(),
            SizedBox(height: AppSpacing.md),
            Text(
              DriverChromeCopy.searchInProgress,
              key: ManualAddressKeys.searchLoading,
            ),
          ],
        ),
      );
    }
    if (_searchPhase == _SearchPhase.error) {
      return Center(
        child: Text(
          _offline
              ? DriverChromeCopy.manualOffline
              : DriverChromeCopy.searchFailed,
          key: _offline
              ? ManualAddressKeys.offline
              : ManualAddressKeys.searchError,
        ),
      );
    }
    if (_searchPhase == _SearchPhase.zero) {
      return const Center(
        child: Text(
          DriverChromeCopy.searchZeroMatch,
          key: ManualAddressKeys.searchZero,
        ),
      );
    }
    if (_hits.isEmpty) {
      return const SizedBox.shrink();
    }
    return ListView.builder(
      key: ManualAddressKeys.candidateList,
      itemCount: _hits.length,
      itemBuilder: (context, index) {
        final hit = _hits[index];
        final subtitle = [
          if ((hit.jibunAddress ?? '').isNotEmpty) hit.jibunAddress,
          if ((hit.buildingName ?? '').isNotEmpty) hit.buildingName,
        ].join(' · ');
        return ListTile(
          title: Text(hit.primaryLine),
          subtitle: subtitle.isEmpty ? null : Text(subtitle),
          onTap: () => _selectCandidate(hit),
        );
      },
    );
  }

  Widget _buildConfirm() {
    final selected = _selected;
    if (selected == null) return const SizedBox.shrink();
    if (_success != null) {
      final evidenceFailed =
          _invoice.status == InvoiceEvidenceUploadStatus.failed;
      return Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              DriverChromeCopy.manualRegisterSuccess,
              key: ManualAddressKeys.success,
            ),
            if (evidenceFailed) ...[
              const SizedBox(height: AppSpacing.md),
              Text(
                _submitError ?? DriverChromeCopy.manualInvoiceUploadFailed,
                key: ManualAddressKeys.invoiceStatus,
              ),
              const SizedBox(height: AppSpacing.md),
              DsPrimaryButton(
                key: ManualAddressKeys.invoiceRetry,
                label: DriverChromeCopy.manualInvoiceRetry,
                busy: _invoice.status == InvoiceEvidenceUploadStatus.uploading,
                onPressed: _invoice.status == InvoiceEvidenceUploadStatus.uploading
                    ? null
                    : _retryEvidence,
              ),
            ],
            const SizedBox(height: AppSpacing.lg),
            DsPrimaryButton(
              label: DriverChromeCopy.openDeliveryList,
              onPressed: () => Navigator.of(context).pop(_success),
            ),
          ],
        ),
      );
    }
    return ListView(
      padding: const EdgeInsets.all(AppSpacing.md),
      children: [
        Text(
          DriverChromeCopy.manualSelectedAddress,
          style: Theme.of(context).textTheme.titleMedium,
        ),
        const SizedBox(height: AppSpacing.sm),
        Text(
          selected.primaryLine,
          key: ManualAddressKeys.selectedAddress,
        ),
        if ((selected.buildingName ?? '').isNotEmpty)
          Text(selected.buildingName!),
        const SizedBox(height: AppSpacing.lg),
        TextField(
          key: ManualAddressKeys.detailField,
          controller: _detailController,
          decoration: const InputDecoration(
            labelText: DriverChromeCopy.manualDetailAddress,
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        TextField(
          key: ManualAddressKeys.dongField,
          controller: _dongController,
          decoration: const InputDecoration(
            labelText: DriverChromeCopy.manualDong,
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        TextField(
          key: ManualAddressKeys.unitField,
          controller: _unitController,
          decoration: const InputDecoration(
            labelText: DriverChromeCopy.manualHo,
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        TextField(
          key: ManualAddressKeys.quantityField,
          controller: _quantityController,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(
            labelText: DriverChromeCopy.manualQuantity,
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        TextField(
          key: ManualAddressKeys.recipientNameField,
          controller: _nameController,
          maxLength: maxManualRecipientNameLength,
          decoration: const InputDecoration(
            labelText: DriverChromeCopy.manualRecipientName,
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        TextField(
          key: ManualAddressKeys.recipientPhoneField,
          controller: _phoneController,
          keyboardType: TextInputType.phone,
          decoration: const InputDecoration(
            labelText: DriverChromeCopy.manualRecipientPhone,
          ),
        ),
        if (_pin != null) ...[
          const SizedBox(height: AppSpacing.md),
          OutlinedButton(
            key: ManualAddressKeys.pinAdjustButton,
            onPressed: _submitting ? null : _openPinAdjust,
            child: const Text(DriverChromeCopy.manualPinAdjust),
          ),
          Text(
            _pin!.source == ManualPinSource.manualAdjust
                ? DriverChromeCopy.manualPinConfirm
                : DriverChromeCopy.manualPinHint,
          ),
        ],
        if (showInvoiceEvidenceSection(
          reason: widget.reason,
          requirement: widget.invoiceEvidenceRequirement ??
              invoiceEvidenceRequirementFor(widget.reason),
        )) ...[
          const SizedBox(height: AppSpacing.lg),
          Text(
            DriverChromeCopy.manualInvoiceEvidenceTitle,
            key: ManualAddressKeys.invoiceEvidence,
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: AppSpacing.sm),
          const Text(DriverChromeCopy.manualInvoiceEvidenceHint),
          const SizedBox(height: AppSpacing.sm),
          Row(
            children: [
              TextButton(
                onPressed: _submitting
                    ? null
                    : () => _captureInvoice(ImageSource.camera),
                child: const Text(DriverChromeCopy.manualInvoiceCapture),
              ),
              TextButton(
                onPressed: _submitting
                    ? null
                    : () => _captureInvoice(ImageSource.gallery),
                child: const Text(DriverChromeCopy.manualInvoiceGallery),
              ),
            ],
          ),
          if (_invoice.hasLocalImage) ...[
            const SizedBox(height: AppSpacing.sm),
            SizedBox(
              key: ManualAddressKeys.invoicePreview,
              height: 160,
              child: Image.memory(
                Uint8List.fromList(_invoice.bytes!),
                fit: BoxFit.contain,
                errorBuilder: (context, error, stackTrace) => const ColoredBox(
                  color: Color(0xFF2A2A2A),
                  child: Center(child: Icon(Icons.receipt_long)),
                ),
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(
              _invoiceStatusLabel(),
              key: ManualAddressKeys.invoiceStatus,
            ),
            Row(
              children: [
                TextButton(
                  key: ManualAddressKeys.invoiceRetake,
                  onPressed: _submitting
                      ? null
                      : () => _captureInvoice(ImageSource.camera),
                  child: const Text(DriverChromeCopy.manualInvoiceRetake),
                ),
                TextButton(
                  key: ManualAddressKeys.invoiceRemove,
                  onPressed: _submitting ? null : _removeInvoice,
                  child: const Text(DriverChromeCopy.manualInvoiceRemove),
                ),
              ],
            ),
          ],
        ],
        const SizedBox(height: AppSpacing.lg),
        if (_submitError != null)
          Text(
            _submitError!,
            key: _offline
                ? ManualAddressKeys.offline
                : ManualAddressKeys.failure,
          ),
        if (_submitting)
          const Padding(
            padding: EdgeInsets.only(bottom: AppSpacing.md),
            child: Text(
              DriverChromeCopy.manualRegistering,
              key: ManualAddressKeys.registerBusy,
            ),
          ),
        DsPrimaryButton(
          key: ManualAddressKeys.confirmButton,
          label: DriverChromeCopy.manualRegister,
          busy: _submitting,
          onPressed: _submitting ? null : _submit,
        ),
      ],
    );
  }
}
