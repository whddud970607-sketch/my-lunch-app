import 'package:flutter_test/flutter_test.dart';
import 'package:delivery_shield_mobile/map/map_provider_id.dart';

void main() {
  test('mapProviderId parse and labels', () {
    expect(MapProviderIdX.tryParse('kakao'), MapProviderId.kakao);
    expect(MapProviderIdX.tryParse('naver'), MapProviderId.naver);
    expect(MapProviderIdX.tryParse('tmap'), MapProviderId.tmap);
    expect(MapProviderIdX.tryParse('nope'), isNull);
    expect(MapProviderId.kakao.displayLabel, '카카오맵');
    expect(MapProviderId.naver.displayLabel, '네이버지도');
    expect(MapProviderId.tmap.displayLabel, '티맵');
    expect(MapProviderId.values, contains(MapProviderId.tmap));
  });
}
