import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:delivery_shield_mobile/models/manual_address_candidate.dart';
import 'package:delivery_shield_mobile/screens/manual_address_keys.dart';
import 'package:delivery_shield_mobile/screens/manual_address_register_data.dart';
import 'package:delivery_shield_mobile/screens/manual_address_register_screen.dart';
import 'package:delivery_shield_mobile/services/api_client.dart';
import 'package:delivery_shield_mobile/services/manual_address_repository.dart';
import 'package:delivery_shield_mobile/theme/app_theme.dart';

const _candidate = ManualAddressCandidate(
  roadAddress: '인천광역시 남동구 서창남순환로 55',
  jibunAddress: '인천광역시 남동구 서창동 123',
  buildingName: '에코에비뉴',
  latitude: 37.42,
  longitude: 126.74,
);

class FakeManualRepo extends ManualAddressRepository {
  FakeManualRepo() : super(ApiClient(tokenProvider: () async => 't'));

  List<ManualAddressCandidate> hits = const [_candidate];
  int suggestCalls = 0;
  int registerCalls = 0;
  String? lastKey;
  String? lastDetailAddress;
  Object? suggestError;
  Object? registerError;
  ManualRegisterResult result = const ManualRegisterResult(
    ok: true,
    resultCode: 'applied',
    pointId: 'point-1',
    jobId: 'job-1',
  );

  Duration suggestDelay = Duration.zero;

  @override
  Future<List<ManualAddressCandidate>> suggest(String query) async {
    suggestCalls += 1;
    if (suggestDelay > Duration.zero) {
      await Future<void>.delayed(suggestDelay);
    }
    if (suggestError != null) throw suggestError!;
    return hits;
  }

  @override
  Future<ManualRegisterResult> register({
    required String commitIdempotencyKey,
    required ManualAddressCandidate candidate,
    String? detailAddress,
    String? dong,
    String? unit,
    required int quantity,
    String? serviceDate,
  }) async {
    registerCalls += 1;
    lastKey = commitIdempotencyKey;
    lastDetailAddress = composeManualDetailAddress(
      detail: detailAddress,
      dong: dong,
      unit: unit,
    );
    if (registerError != null) throw registerError!;
    return result;
  }
}

void main() {
  test('quantity defaults to 1 and compose dong/ho', () {
    expect(defaultManualQuantity(), 1);
    expect(normalizeManualQuantity(''), 1);
    expect(normalizeManualQuantity('2'), 2);
    expect(
      composeManualDetailPreview(detail: '경비실', dong: '504', unit: '2003'),
      '504동 2003호 경비실',
    );
    expect(isOfflineManualFailure(Exception('timeout')), isTrue);
    expect(isOfflineManualFailure(Exception('provider boom')), isFalse);
  });

  test('idempotency key is reused until reset', () {
    var n = 0;
    final id = ManualRegisterIdempotency(createKey: () => 'k-${n++}');
    expect(id.key, 'k-0');
    expect(id.key, 'k-0');
    id.reset();
    expect(id.key, 'k-1');
  });

  testWidgets('CTA search states and select does not create', (tester) async {
    final repo = FakeManualRepo()
      ..suggestDelay = const Duration(milliseconds: 50);
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark(),
        home: ManualAddressRegisterScreen(
          repository: repo,
          debounce: Duration.zero,
        ),
      ),
    );

    expect(find.text('주소 검색'), findsOneWidget);
    await tester.enterText(find.byKey(ManualAddressKeys.searchField), '서창');
    await tester.pump();
    expect(find.byKey(ManualAddressKeys.searchLoading), findsOneWidget);
    await tester.pumpAndSettle();
    expect(find.byKey(ManualAddressKeys.candidateList), findsOneWidget);
    expect(repo.registerCalls, 0);

    await tester.tap(find.text('인천광역시 남동구 서창남순환로 55'));
    await tester.pumpAndSettle();
    expect(find.byKey(ManualAddressKeys.selectedAddress), findsOneWidget);
    expect(find.byKey(ManualAddressKeys.confirmButton), findsOneWidget);
    expect(repo.registerCalls, 0);
    expect(find.byKey(ManualAddressKeys.quantityField), findsOneWidget);
    expect(find.text('1'), findsWidgets);
  });

  testWidgets('zero and error search states', (tester) async {
    final repo = FakeManualRepo()..hits = const [];
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark(),
        home: ManualAddressRegisterScreen(
          repository: repo,
          debounce: Duration.zero,
        ),
      ),
    );
    await tester.enterText(find.byKey(ManualAddressKeys.searchField), '없는주소');
    await tester.pumpAndSettle();
    expect(find.byKey(ManualAddressKeys.searchZero), findsOneWidget);

    repo.suggestError = Exception('provider boom');
    await tester.enterText(find.byKey(ManualAddressKeys.searchField), '서울시청');
    await tester.pumpAndSettle();
    expect(find.byKey(ManualAddressKeys.searchError), findsOneWidget);
    expect(find.byKey(ManualAddressKeys.offline), findsNothing);
  });

  testWidgets('double submit reuses key and success pops to caller',
      (tester) async {
    final repo = FakeManualRepo();
    final idem = ManualRegisterIdempotency(createKey: () => 'fixed-key');
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark(),
        home: Builder(
          builder: (context) => TextButton(
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => ManualAddressRegisterScreen(
                    repository: repo,
                    idempotency: idem,
                    debounce: Duration.zero,
                  ),
                ),
              );
            },
            child: const Text('open-manual'),
          ),
        ),
      ),
    );
    await tester.tap(find.text('open-manual'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(ManualAddressKeys.searchField), '서창');
    await tester.pumpAndSettle();
    await tester.tap(find.text('인천광역시 남동구 서창남순환로 55'));
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(ManualAddressKeys.dongField), '504');
    await tester.enterText(find.byKey(ManualAddressKeys.unitField), '2003');
    await tester.tap(find.byKey(ManualAddressKeys.confirmButton));
    await tester.tap(find.byKey(ManualAddressKeys.confirmButton));
    await tester.pumpAndSettle();

    expect(repo.registerCalls, 1);
    expect(repo.lastKey, 'fixed-key');
    expect(repo.lastDetailAddress, '504동 2003호');
    expect(find.text('open-manual'), findsOneWidget);
    expect(find.byKey(ManualAddressKeys.success), findsNothing);
  });

  testWidgets('retry reuses the same idempotency key', (tester) async {
    final repo = FakeManualRepo()..registerError = Exception('timeout');
    final idem = ManualRegisterIdempotency(createKey: () => 'retry-key');
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark(),
        home: ManualAddressRegisterScreen(
          repository: repo,
          idempotency: idem,
          debounce: Duration.zero,
        ),
      ),
    );
    await tester.enterText(find.byKey(ManualAddressKeys.searchField), '서창');
    await tester.pumpAndSettle();
    await tester.tap(find.text('인천광역시 남동구 서창남순환로 55'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(ManualAddressKeys.confirmButton));
    await tester.pumpAndSettle();
    expect(find.byKey(ManualAddressKeys.offline), findsOneWidget);
    expect(find.text('등록 성공'), findsNothing);

    repo.registerError = null;
    await tester.tap(find.byKey(ManualAddressKeys.confirmButton));
    await tester.pumpAndSettle();
    expect(repo.registerCalls, 2);
    expect(repo.lastKey, 'retry-key');
    expect(find.byKey(ManualAddressKeys.success), findsOneWidget);
  });

  testWidgets('offline register does not fake success', (tester) async {
    final repo = FakeManualRepo()
      ..registerError = Exception('SocketException: failed host lookup');
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark(),
        home: ManualAddressRegisterScreen(
          repository: repo,
          debounce: Duration.zero,
        ),
      ),
    );
    await tester.enterText(find.byKey(ManualAddressKeys.searchField), '서창');
    await tester.pumpAndSettle();
    await tester.tap(find.text('인천광역시 남동구 서창남순환로 55'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(ManualAddressKeys.confirmButton));
    await tester.pumpAndSettle();
    expect(find.byKey(ManualAddressKeys.success), findsNothing);
    expect(find.text('인터넷에 연결한 뒤 다시 시도해 주세요.'), findsOneWidget);
  });
}
