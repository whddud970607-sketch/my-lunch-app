import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:delivery_shield_mobile/models/manual_address_candidate.dart';
import 'package:delivery_shield_mobile/screens/manual_address_keys.dart';
import 'package:delivery_shield_mobile/screens/manual_address_register_data.dart';
import 'package:delivery_shield_mobile/screens/manual_address_register_screen.dart';
import 'package:delivery_shield_mobile/services/api_client.dart';
import 'package:delivery_shield_mobile/services/manual_address_repository.dart';
import 'package:delivery_shield_mobile/copy/driver_chrome_copy.dart';
import 'package:delivery_shield_mobile/theme/app_theme.dart';

List<int> _validJpeg() => base64Decode(
      '/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBwgHBgkIBwgKCgkLDRYPDQwMDRsUFRAWIB0iIiAdHx8kKDQsJCYxJx8fLT0tMTU3Ojo6Iys/RD84QzQ5OjcBCgoKDQwNGg8PGjclHyU3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3N//AABEIAAEAAQMBIgACEQEDEQH/xAAXAAADAQAAAAAAAAAAAAAAAAABAgcH/8QAFhABAQEAAAAAAAAAAAAAAAAAAAER/9oADAMBAAIQAxAAAAGf/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPwB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwB//9k=',
    );

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
  int uploadCalls = 0;
  String? lastKey;
    String? lastDetailAddress;
    String? lastRecipientName;
    ManualPinSelection? lastPin;
  ManualRegisterReason? lastReason;
  Object? suggestError;
  Object? registerError;
  Object? uploadError;
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
    String? recipientName,
    String? recipientPhone,
    ManualPinSelection? pin,
    required int quantity,
    String? serviceDate,
    ManualRegisterReason reason = ManualRegisterReason.manualEntry,
  }) async {
    registerCalls += 1;
    lastKey = commitIdempotencyKey;
    lastRecipientName = sanitizeManualRecipientName(recipientName);
    lastPin = pin;
    lastReason = reason;
    lastDetailAddress = composeManualDetailAddress(
      detail: detailAddress,
      dong: dong,
      unit: unit,
    );
    if (registerError != null) throw registerError!;
    return result;
  }

  @override
  Future<InvoiceEvidenceUploadResult> uploadInvoiceEvidence({
    required String pointId,
    required List<int> bytes,
    DateTime? capturedAt,
    ManualRegisterReason? reason,
  }) async {
    uploadCalls += 1;
    if (uploadError != null) throw uploadError!;
    return const InvoiceEvidenceUploadResult(
      ok: true,
      evidenceStatus: 'uploaded',
      evidenceType: 'manual_invoice_scan_failure',
    );
  }
}

void main() {
  setUp(() {
    TestWidgetsFlutterBinding.ensureInitialized();
    final binding = TestWidgetsFlutterBinding.instance;
    binding.window.physicalSizeTestValue = const Size(800, 2400);
    binding.window.devicePixelRatioTestValue = 1;
  });

  tearDown(() {
    final binding = TestWidgetsFlutterBinding.instance;
    binding.window.clearPhysicalSizeTestValue();
    binding.window.clearDevicePixelRatioTestValue();
  });

  test('base address stays separate from dong/ho geocoding', () {
    expect(
      composeManualDetailAddress(detail: '', dong: '504', unit: '2004'),
      '504동 2004호',
    );
    expect(
      pickManualPinSelection(
        adjusted: const ManualPinSelection(
          latitude: 37.1,
          longitude: 126.1,
          source: ManualPinSource.manualAdjust,
        ),
        apartmentDong: const ManualPinSelection(
          latitude: 37.2,
          longitude: 126.2,
          source: ManualPinSource.apartmentDong,
        ),
        baseAddress: const ManualPinSelection(
          latitude: 37.3,
          longitude: 126.3,
          source: ManualPinSource.baseAddress,
        ),
      )?.source,
      ManualPinSource.manualAdjust,
    );
    expect(sanitizeManualRecipientName(' 홍길동 '), '홍길동');
    expect(sanitizeManualRecipientPhone('010-1234-5678'), '01012345678');
    expect(
      showInvoiceEvidenceSection(
        reason: ManualRegisterReason.barcodeScanFailed,
      ),
      isTrue,
    );
    expect(
      showInvoiceEvidenceSection(reason: ManualRegisterReason.manualEntry),
      isFalse,
    );
    expect(
      manualReasonApiValue(ManualRegisterReason.barcodeScanFailed),
      'barcode_scan_failed',
    );
    expect(
      manualReasonApiValue(ManualRegisterReason.manualEntry),
      'manual_entry',
    );
  });

  test('search coords are included on the register payload', () {
    expect(
      manualRegisterCoordinateFields(_candidate),
      {'latitude': 37.42, 'longitude': 126.74},
    );
    expect(
      manualRegisterCoordinateFields(
        const ManualAddressCandidate(roadAddress: 'x'),
      ),
      isEmpty,
    );
    expect(
      manualRegisterCoordinateFields(
        const ManualAddressCandidate(
          latitude: 91,
          longitude: 126.74,
        ),
      ),
      isEmpty,
    );
  });

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

  testWidgets('invoice evidence shows after barcode scan failure', (tester) async {
    final repo = FakeManualRepo();
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark(),
        home: ManualAddressRegisterScreen(
          repository: repo,
          reason: ManualRegisterReason.barcodeScanFailed,
          debounce: Duration.zero,
        ),
      ),
    );
    await tester.enterText(find.byKey(ManualAddressKeys.searchField), '서창');
    await tester.pumpAndSettle();
    await tester.tap(find.text('인천광역시 남동구 서창남순환로 55'));
    await tester.pumpAndSettle();
    expect(find.byKey(ManualAddressKeys.invoiceEvidence), findsOneWidget);
    expect(find.byKey(ManualAddressKeys.recipientNameField), findsOneWidget);
    expect(find.byKey(ManualAddressKeys.pinAdjustButton), findsOneWidget);
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

  testWidgets('evidence preview remove and retry after upload failure',
      (tester) async {
    final repo = FakeManualRepo()..uploadError = Exception('timeout');
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark(),
        home: ManualAddressRegisterScreen(
          repository: repo,
          reason: ManualRegisterReason.barcodeScanFailed,
          debounce: Duration.zero,
          pickInvoice: (_) async => InvoiceEvidenceDraft(
            bytes: _validJpeg(),
            capturedAt: DateTime.utc(2026, 9, 5),
            status: InvoiceEvidenceUploadStatus.ready,
          ),
        ),
      ),
    );
    await tester.enterText(find.byKey(ManualAddressKeys.searchField), '서창');
    await tester.pumpAndSettle();
    await tester.tap(find.text('인천광역시 남동구 서창남순환로 55'));
    await tester.pumpAndSettle();
    await tester.tap(find.text(DriverChromeCopy.manualInvoiceCapture));
    await tester.pumpAndSettle();
    expect(find.byKey(ManualAddressKeys.invoicePreview), findsOneWidget);
    expect(find.byKey(ManualAddressKeys.invoiceRetake), findsOneWidget);
    expect(find.byKey(ManualAddressKeys.invoiceRemove), findsOneWidget);

    await tester.tap(find.byKey(ManualAddressKeys.invoiceRemove));
    await tester.pumpAndSettle();
    expect(find.byKey(ManualAddressKeys.invoicePreview), findsNothing);

    await tester.tap(find.text(DriverChromeCopy.manualInvoiceCapture));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(ManualAddressKeys.confirmButton));
    await tester.tap(find.byKey(ManualAddressKeys.confirmButton));
    await tester.pumpAndSettle();
    expect(repo.registerCalls, 1);
    expect(repo.lastReason, ManualRegisterReason.barcodeScanFailed);
    expect(repo.uploadCalls, 1);
    expect(find.byKey(ManualAddressKeys.success), findsOneWidget);
    expect(find.byKey(ManualAddressKeys.invoiceRetry), findsOneWidget);

    repo.uploadError = null;
    await tester.tap(find.byKey(ManualAddressKeys.invoiceRetry));
    await tester.pumpAndSettle();
    expect(repo.uploadCalls, 2);
  });

  testWidgets('manual entry register skips evidence upload', (tester) async {
    final repo = FakeManualRepo();
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark(),
        home: ManualAddressRegisterScreen(
          repository: repo,
          reason: ManualRegisterReason.manualEntry,
          debounce: Duration.zero,
        ),
      ),
    );
    await tester.enterText(find.byKey(ManualAddressKeys.searchField), '서창');
    await tester.pumpAndSettle();
    await tester.tap(find.text('인천광역시 남동구 서창남순환로 55'));
    await tester.pumpAndSettle();
    expect(find.byKey(ManualAddressKeys.invoiceEvidence), findsNothing);
    await tester.tap(find.byKey(ManualAddressKeys.confirmButton));
    await tester.pumpAndSettle();
    expect(repo.registerCalls, 1);
    expect(repo.lastReason, ManualRegisterReason.manualEntry);
    expect(repo.uploadCalls, 0);
    expect(find.byKey(ManualAddressKeys.success), findsOneWidget);
  });
}
