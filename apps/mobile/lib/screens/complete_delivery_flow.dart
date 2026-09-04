import 'package:flutter/material.dart';

import '../models/map_spike_point.dart';
import '../services/map_spike_service.dart';
import '../sync/sync_scope.dart';
import 'complete_delivery_screen.dart';

/// Opens the existing CompleteDeliveryScreen. Does not complete locally.
Future<Object?> openCompleteDeliveryScreen({
  required BuildContext context,
  required MapSpikePoint point,
  required MapSpikeService mapSpikeService,
  String? driverId,
  MapSpikePoint? nextPoint,
  VoidCallback? onOpenMap,
  VoidCallback? onOpenList,
  int? shipmentCount,
}) {
  if (point.isCompleted) return Future<Object?>.value(null);
  final scope = SyncScope.maybeOf(context);
  final resolved = (driverId != null && driverId.isNotEmpty)
      ? driverId
      : point.driverId;
  return Navigator.of(context, rootNavigator: true).push<Object?>(
    MaterialPageRoute(
      builder: (_) => CompleteDeliveryScreen(
        point: point,
        driverId: resolved,
        mapSpikeService: mapSpikeService,
        syncEngine: scope?.syncEngine,
        completionEnqueue: scope?.completionEnqueue,
        projections: scope?.projections,
        nextPoint: nextPoint,
        onOpenMap: onOpenMap,
        onOpenList: onOpenList,
        shipmentCount: shipmentCount,
      ),
    ),
  );
}
