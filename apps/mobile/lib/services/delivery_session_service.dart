import '../models/delivery_session.dart';
import 'api_client.dart';
import 'api_exception.dart';

class RouteBatchUploadResult {
  RouteBatchUploadResult({
    required this.accepted,
    required this.inserted,
    this.lastUploadedSequence,
    this.rejectedAfterEnd = 0,
  });

  final int accepted;
  final int inserted;
  final int? lastUploadedSequence;
  final int rejectedAfterEnd;
}

/// Nest Session API surface (testable via fakes).
abstract class DeliverySessionApi {
  Future<DeliverySession?> fetchActive();
  Future<DeliverySession> start({
    required String idempotencyKey,
    String? deliveryJobId,
    String? workdayId,
  });
  Future<DeliverySession> end({
    required String sessionId,
    bool forceIncomplete = false,
    bool finalize = false,
  });
  Future<DeliverySession> finalize({required String sessionId});
  Future<RouteBatchUploadResult> uploadRouteBatch({
    required String sessionId,
    required List<DeliveryRoutePoint> points,
  });
  Future<Map<String, dynamic>> fetchReport(String sessionId);
}

class DeliverySessionService implements DeliverySessionApi {
  DeliverySessionService(this._api);

  final ApiClient _api;

  @override
  Future<DeliverySession?> fetchActive() async {
    final body = await _api.getJson('/delivery/sessions/active');
    final session = body['session'];
    if (session is! Map<String, dynamic>) return null;
    return DeliverySession.fromJson(session);
  }

  @override
  Future<DeliverySession> start({
    required String idempotencyKey,
    String? deliveryJobId,
    String? workdayId,
  }) async {
    final body = await _api.postJson('/delivery/sessions/start', {
      'idempotencyKey': idempotencyKey,
      if (deliveryJobId != null) 'deliveryJobId': deliveryJobId,
      if (workdayId != null && workdayId.isNotEmpty) 'workdayId': workdayId,
      'clientStartedAt': DateTime.now().toUtc().toIso8601String(),
    });
    final session = body['session'];
    if (session is! Map<String, dynamic>) {
      throw ApiException(message: '세션을 시작하지 못했습니다.');
    }
    return DeliverySession.fromJson(session);
  }

  @override
  Future<DeliverySession> end({
    required String sessionId,
    bool forceIncomplete = false,
    bool finalize = false,
  }) async {
    final body = await _api.postJson('/delivery/sessions/$sessionId/end', {
      'forceIncomplete': forceIncomplete,
      'finalize': finalize,
    });
    final session = body['session'];
    if (session is! Map<String, dynamic>) {
      throw ApiException(message: '세션을 종료하지 못했습니다.');
    }
    return DeliverySession.fromJson(session);
  }

  @override
  Future<DeliverySession> finalize({required String sessionId}) async {
    final body =
        await _api.postJson('/delivery/sessions/$sessionId/finalize', {});
    final session = body['session'];
    if (session is! Map<String, dynamic>) {
      throw ApiException(message: '세션을 확정하지 못했습니다.');
    }
    return DeliverySession.fromJson(session);
  }

  @override
  Future<RouteBatchUploadResult> uploadRouteBatch({
    required String sessionId,
    required List<DeliveryRoutePoint> points,
  }) async {
    final body = await _api.postJson(
      '/delivery/sessions/$sessionId/route-points/batch',
      {
        'points': points.map((p) => p.toJson()).toList(),
      },
    );
    return RouteBatchUploadResult(
      accepted: (body['accepted'] as num?)?.toInt() ?? 0,
      inserted: (body['inserted'] as num?)?.toInt() ?? 0,
      lastUploadedSequence: (body['lastUploadedSequence'] as num?)?.toInt(),
      rejectedAfterEnd: (body['rejectedAfterEnd'] as num?)?.toInt() ?? 0,
    );
  }

  @override
  Future<Map<String, dynamic>> fetchReport(String sessionId) async {
    return _api.getJson('/delivery/sessions/$sessionId/report');
  }
}
