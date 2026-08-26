import 'package:flutter_test/flutter_test.dart';

import 'package:delivery_shield_mobile/models/me_response.dart';

void main() {
  test('MeResponse parses driver payload', () {
    final me = MeResponse.fromJson({
      'userId': 'u1',
      'email': 'd@test.com',
      'role': 'driver',
      'companyId': null,
      'displayName': 'Driver',
      'driver': {
        'id': 'd1',
        'companyId': null,
        'workStatus': 'available',
      },
    });
    expect(me.isDriver, isTrue);
    expect(me.driver?.id, 'd1');
  });
}
