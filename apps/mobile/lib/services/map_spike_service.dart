import '../services/api_client.dart';
import '../models/map_spike_point.dart';

class MapSpikeService {
  MapSpikeService(this._api);

  final ApiClient _api;

  Future<MapSpikePoint> fetchSpikePoint() async {
    final json = await _api.getJson('/delivery/map-spike');
    return MapSpikePoint.fromJson(json);
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
    // Caller refreshes full point; return coords confirmation.
    return MapSpikePoint(
      provider: 'kakao',
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
}
