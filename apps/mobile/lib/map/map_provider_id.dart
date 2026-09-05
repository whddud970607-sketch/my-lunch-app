/// Which map SDK renders the delivery map UI.
///
/// Distinct from geocoding source ([MapSpikePoint.geocodeProvider]).
enum MapProviderId {
  kakao,
  naver,
  tmap,
}

extension MapProviderIdX on MapProviderId {
  String get storageValue => name;

  String get displayLabel => switch (this) {
        MapProviderId.kakao => '카카오맵',
        MapProviderId.naver => '네이버지도',
        MapProviderId.tmap => '티맵',
      };

  static MapProviderId? tryParse(String? raw) {
    if (raw == null || raw.isEmpty) return null;
    for (final v in MapProviderId.values) {
      if (v.name == raw) return v;
    }
    return null;
  }
}
