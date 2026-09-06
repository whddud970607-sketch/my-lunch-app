import 'package:url_launcher/url_launcher.dart';

import '../map/map_provider_id.dart';
import '../models/map_spike_point.dart';

/// Opens an installed navi/map app for non-Kakao map providers.
///
/// Kakao product navigation is in-app only ([KakaoInAppNavi]) — this class
/// never builds `kakaonavi://` or launches external Kakao Navi.
/// Does not invent fallback coordinates.
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

  /// Whether [uri] is a forbidden handcrafted Kakao Navi navigate scheme.
  static bool isHandcraftedKakaoNaviUri(Uri uri) =>
      uri.scheme == 'kakaonavi' && uri.host == 'navigate';

  /// Non-Kakao deep links only. Kakao preferred → empty (in-app path).
  static List<Uri> buildCandidates({
    required double latitude,
    required double longitude,
    required String name,
    MapProviderId preferredProvider = MapProviderId.kakao,
  }) {
    if (!isValidCoordinate(latitude, longitude)) return const [];
    // Product Kakao navigation must stay in-app — no external candidates.
    if (preferredProvider == MapProviderId.kakao) return const [];

    final encoded = Uri.encodeComponent(
      name.trim().isEmpty ? _fallbackName : name.trim(),
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
      return [naver, tmap, kakaoMap, geo];
    }
    if (preferredProvider == MapProviderId.tmap) {
      return [tmap, kakaoMap, naver, geo];
    }
    return const [];
  }

  static Future<bool> open({
    required double latitude,
    required double longitude,
    required String name,
    MapProviderId preferredProvider = MapProviderId.kakao,
    Future<bool> Function(Uri uri)? launch,
  }) async {
    // Kakao = in-app KNNaviView only; never external app launch.
    if (preferredProvider == MapProviderId.kakao) return false;

    final candidates = buildCandidates(
      latitude: latitude,
      longitude: longitude,
      name: name,
      preferredProvider: preferredProvider,
    );
    if (candidates.isEmpty) return false;
    final send = launch ?? _launch;
    for (final uri in candidates) {
      assert(
        !isHandcraftedKakaoNaviUri(uri),
        'handcrafted kakaonavi://navigate must not be used',
      );
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
