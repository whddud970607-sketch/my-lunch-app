import 'package:flutter/foundation.dart';

import '../services/api_client.dart';
import '../models/map_spike_point.dart';

class MapSpikeService {
  MapSpikeService(this._api);

  final ApiClient _api;

  /// Legacy single spike point (phase1-map-spike-kakao).
  Future<MapSpikePoint> fetchSpikePoint() async {
    final json = await _api.getJson('/delivery/map-spike');
    return MapSpikePoint.fromJson(json);
  }

  /// Test fixture: fixture:namdong10-sim:% for current driver.
  /// Returns timingMsApi for event-based perf logs (no secrets).
  Future<({List<MapSpikePoint> points, int apiMs})> fetchNamdong10Points() async {
    final sw = Stopwatch()..start();
    final json = await _api.getJson('/delivery/map-spike/namdong10');
    final apiMs = sw.elapsedMilliseconds;
    final raw = json['points'];
    if (raw is! List) {
      throw StateError('namdong10 points missing');
    }
    final points = raw
        .whereType<Map>()
        .map((e) => MapSpikePoint.fromJson(Map<String, dynamic>.from(e)))
        .toList(growable: false);
    debugPrint('[timing] namdong10_api_ms=$apiMs count=${points.length}');
    for (final p in points) {
      final match = p.quantity == p.shipments.length;
      debugPrint(
        '[shipments-check] qty=${p.quantity} shipments=${p.shipments.length} '
        'match=$match',
      );
    }
    return (points: points, apiMs: apiMs);
  }

  Future<MapSpikePoint> saveDriverVerifiedPin({
    required String pointId,
    required double latitude,
    required double longitude,
  }) async {
    final json = await _api.patchJson('/delivery/map-spike/pin', {
      'pointId': pointId,
      'latitude': latitude,
      'longitude': longitude,
    });
    return MapSpikePoint(
      geocodeProvider: 'kakao',
      pinAccuracy: json['pinAccuracy'] as String? ?? 'driver_verified',
      latitude: (json['latitude'] as num).toDouble(),
      longitude: (json['longitude'] as num).toDouble(),
      carrier: '',
      customerName: '',
      address: '',
      detailAddress: '',
      product: '',
      quantity: 1,
      status: '',
      statusCode: 'pending',
      pointId: pointId,
      jobId: '',
      driverId: '',
      piiMasked: false,
    );
  }

  Future<void> completeSpike({
    required String pointId,
    required String storagePath,
    double? latitude,
    double? longitude,
  }) async {
    await _api.postJson('/delivery/map-spike/complete', {
      'pointId': pointId,
      'storagePath': storagePath,
      'latitude': ?latitude,
      'longitude': ?longitude,
    });
  }

  /// Nest decrypt endpoint. Caller must not log [accessInfo].
  Future<String> fetchAccessInfo(String pointId) async {
    final json = await _api.getJson('/delivery/points/$pointId/access-info');
    final value = json['accessInfo'] as String?;
    if (value == null || value.isEmpty) {
      throw StateError('accessInfo missing');
    }
    return value;
  }

  /// Lazy PII detail for one assigned point. Never logs contact/address values.
  Future<MapSpikePoint> fetchPointDetail(String pointId) async {
    final json = await _api.getJson('/delivery/points/$pointId');
    return MapSpikePoint.fromJson(json);
  }
}
