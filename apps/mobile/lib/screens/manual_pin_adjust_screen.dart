import 'package:flutter/material.dart';

import '../copy/driver_chrome_copy.dart';
import '../map/delivery_map_controller.dart';
import '../map/delivery_map_surface.dart';
import '../map/map_provider_settings.dart';
import '../theme/app_spacing.dart';
import '../widgets/ds_primary_button.dart';
import 'manual_address_register_data.dart';

class ManualPinAdjustScreen extends StatefulWidget {
  const ManualPinAdjustScreen({
    super.key,
    required this.initial,
  });

  final ManualPinSelection initial;

  @override
  State<ManualPinAdjustScreen> createState() => _ManualPinAdjustScreenState();
}

class _ManualPinAdjustScreenState extends State<ManualPinAdjustScreen> {
  DeliveryMapController? _controller;
  late var _provider = MapProviderSettings.defaultProvider;
  var _ready = false;

  @override
  void initState() {
    super.initState();
    MapProviderSettings.load().then((id) {
      if (!mounted) return;
      setState(() => _provider = id);
    });
  }

  Future<void> _confirm() async {
    final center = await _controller?.getCenter();
    final lat = center?.latitude ?? widget.initial.latitude;
    final lng = center?.longitude ?? widget.initial.longitude;
    if (!lat.isFinite || !lng.isFinite) return;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return;
    if (!mounted) return;
    Navigator.of(context).pop(
      ManualPinSelection(
        latitude: lat,
        longitude: lng,
        source: ManualPinSource.manualAdjust,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final target = DeliveryLatLng(
      latitude: widget.initial.latitude,
      longitude: widget.initial.longitude,
    );
    return Scaffold(
      appBar: AppBar(title: const Text(DriverChromeCopy.manualPinAdjust)),
      body: Column(
        children: [
          const Padding(
            padding: EdgeInsets.all(AppSpacing.md),
            child: Text(DriverChromeCopy.manualPinHint),
          ),
          Expanded(
            child: Stack(
              alignment: Alignment.center,
              children: [
                DeliveryMapSurface(
                  providerId: _provider,
                  initialTarget: target,
                  pins: const [],
                  onPinTap: (_) {},
                  onReady: (controller) {
                    _controller = controller;
                    setState(() => _ready = true);
                  },
                ),
                const Icon(Icons.location_on, size: 36),
              ],
            ),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(AppSpacing.md),
              child: DsPrimaryButton(
                label: DriverChromeCopy.manualPinConfirm,
                onPressed: _ready ? _confirm : null,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
