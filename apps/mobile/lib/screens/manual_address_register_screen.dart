import 'dart:async';

import 'package:flutter/material.dart';

import '../copy/driver_chrome_copy.dart';
import '../models/manual_address_candidate.dart';
import '../services/api_exception.dart';
import '../services/manual_address_repository.dart';
import '../theme/app_spacing.dart';
import '../widgets/ds_primary_button.dart';
import 'manual_address_keys.dart';
import 'manual_address_register_data.dart';

enum _ManualPhase { search, confirm }

enum _SearchPhase { idle, loading, zero, error }

class ManualAddressRegisterScreen extends StatefulWidget {
  const ManualAddressRegisterScreen({
    super.key,
    required this.repository,
    this.serviceDate,
    this.idempotency,
    this.debounce = const Duration(milliseconds: 400),
  });

  final ManualAddressRepository repository;
  final String? serviceDate;
  final ManualRegisterIdempotency? idempotency;
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

  _ManualPhase _phase = _ManualPhase.search;
  _SearchPhase _searchPhase = _SearchPhase.idle;
  List<ManualAddressCandidate> _hits = const [];
  ManualAddressCandidate? _selected;
  bool _submitting = false;
  bool _submitLock = false;
  String? _submitError;
  bool _offline = false;
  ManualRegisterResult? _success;
  Timer? _debounce;

  @override
  void dispose() {
    _debounce?.cancel();
    _searchController.dispose();
    _detailController.dispose();
    _dongController.dispose();
    _unitController.dispose();
    _quantityController.dispose();
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
    setState(() {
      _selected = hit;
      _phase = _ManualPhase.confirm;
      _submitError = null;
      _success = null;
    });
  }

  Future<void> _submit() async {
    final selected = _selected;
    if (selected == null || _submitLock) return;
    final qty = normalizeManualQuantity(_quantityController.text);
    if (qty < 0) {
      setState(() {
        _submitError = DriverChromeCopy.manualRegisterFailed;
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
        quantity: qty,
        serviceDate: widget.serviceDate,
      );
      if (!mounted) return;
      if (result.ok &&
          (result.resultCode == 'applied' || result.resultCode == 'duplicate')) {
        setState(() {
          _submitLock = false;
          _submitting = false;
          _success = result;
        });
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
        _submitError = _offline
            ? DriverChromeCopy.manualOffline
            : DriverChromeCopy.manualRegisterFailed;
      });
    } catch (e) {
      if (!mounted) return;
      final offline = isOfflineManualFailure(e);
      setState(() {
        _submitLock = false;
        _submitting = false;
        _offline = offline;
        _submitError = offline
            ? DriverChromeCopy.manualOffline
            : DriverChromeCopy.manualRegisterFailed;
      });
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
      return Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              DriverChromeCopy.manualRegisterSuccess,
              key: ManualAddressKeys.success,
            ),
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
