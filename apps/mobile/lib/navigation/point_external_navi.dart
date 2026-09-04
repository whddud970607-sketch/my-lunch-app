import 'package:url_launcher/url_launcher.dart';

import '../map/map_provider_id.dart';
import '../models/map_spike_point.dart';

/// Opens an installed navi/map app to a real Point coordinate.
///
/// Does not use Kakao/TMAP in-app POC activities (those destinations are
/// hardcoded fixtures). Does not invent fallback coordinates.
abstract final class PointExternalNavi {
  static const _fallbackName = '배송지';

  static bool hasValidDestination(MapSpikePoint point) =>
      isValidCoordinate(point.latitude, point.longitude);

  static bool isValidCoordinate(double latitude, double longitude) =>
      latitude != 0 &&
      longitude != 0 &&
      latitude.isFinite &&
      longitude.isFinite;

  /// Operational label only — never UUID / phone / access secret.
  static String labelFor(MapSpikePoint point) {
    final product = point.product.trim();
    if (product.isNotEmpty && product != '****') return product;
    return _fallbackName;
  }

  static List<Uri> buildCandidates({
    required double latitude,
    required double longitude,
    required String name,
    MapProviderId preferredProvider = MapProviderId.kakao,
  }) {
    if (!isValidCoordinate(latitude, longitude)) return const [];
    final encoded = Uri.encodeComponent(
      name.trim().isEmpty ? _fallbackName : name.trim(),
    );
    final kakaoNavi = Uri.parse(
      'kakaonavi://navigate?name=$encoded&coord_type=wgs84'
      '&x=$longitude&y=$latitude',
    );
    final kakaoMap = Uri.parse(
      'kakaomap://route?ep=$latitude,$longitude&by=CAR',
    );
    final tmap = Uri.parse(
      'tmap://route?goalx=$longitude&goaly=$latitude&goalname=$encoded',
    );
    final naver = Uri.parse(
      'nmap://navigation?dlat=$latitude&dlng=$longitude&dname=$encoded',
    );
    final geo = Uri.parse('geo:$latitude,$longitude?q=$latitude,$longitude');

    if (preferredProvider == MapProviderId.naver) {
      return [naver, tmap, kakaoNavi, kakaoMap, geo];
    }
    return [kakaoNavi, kakaoMap, tmap, naver, geo];
  }

  static Future<bool> open({
    required double latitude,
    required double longitude,
    required String name,
    MapProviderId preferredProvider = MapProviderId.kakao,
    Future<bool> Function(Uri uri)? launch,
  }) async {
    final candidates = buildCandidates(
      latitude: latitude,
      longitude: longitude,
      name: name,
      preferredProvider: preferredProvider,
    );
    if (candidates.isEmpty) return false;
    final send = launch ?? _launch;
    for (final uri in candidates) {
      try {
        if (await send(uri)) return true;
      } catch (_) {
        // Try the next installed-app candidate.
      }
    }
    return false;
  }

  static Future<bool> _launch(Uri uri) {
    return launchUrl(uri, mode: LaunchMode.externalApplication);
  }
}
