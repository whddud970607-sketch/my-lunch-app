import '../models/delivery_workday.dart';
import 'api_client.dart';
import 'api_exception.dart';

/// Nest Workday API surface (testable via fakes).
abstract class DeliveryWorkdayApi {
  Future<WorkdayStartResult> start({required String idempotencyKey});
  Future<DeliveryWorkday?> getActive();
  Future<DeliveryWorkday> getById(String workdayId);
  Future<WorkdayReconcileResult> reconcile(String workdayId);
  Future<WorkdayRequestEndResult> requestEnd({
    required String workdayId,
    bool forceIncomplete = false,
    String? endIdempotencyKey,
  });
  Future<DeliveryWorkday> finalize(String workdayId);
  Future<Map<String, dynamic>> fetchReport(String workdayId);
  Future<Map<String, dynamic>> fetchRoute(String workdayId);
}

/// Nest Workday API client. Paths match apps/api WorkdayController.
class DeliveryWorkdayRepository implements DeliveryWorkdayApi {
  DeliveryWorkdayRepository(this._api);

  final ApiClient _api;

  @override
  Future<WorkdayStartResult> start({required String idempotencyKey}) async {
    final body = await _api.postJson('/delivery/workday/start', {
      'idempotencyKey': idempotencyKey,
    });
    final workday = body['workday'];
    if (workday is! Map<String, dynamic>) {
      throw ApiException(message: '배송을 시작하지 못했습니다.');
    }
    return WorkdayStartResult(
      workday: DeliveryWorkday.fromJson(workday),
      created: body['created'] as bool? ?? false,
    );
  }

  @override
  Future<DeliveryWorkday?> getActive() async {
    final body = await _api.getJson('/delivery/workday/active');
    final workday = body['workday'];
    if (workday == null) return null;
    if (workday is! Map<String, dynamic>) return null;
    return DeliveryWorkday.fromJson(workday);
  }

  @override
  Future<DeliveryWorkday> getById(String workdayId) async {
    final body = await _api.getJson('/delivery/workday/$workdayId');
    final workday = body['workday'];
    if (workday is! Map<String, dynamic>) {
      throw ApiException(message: '배송 상태를 불러오지 못했습니다.');
    }
    return DeliveryWorkday.fromJson(workday);
  }

  @override
  Future<WorkdayReconcileResult> reconcile(String workdayId) async {
    final body =
        await _api.postJson('/delivery/workday/$workdayId/reconcile', {});
    final reconcile = body['reconcile'];
    final workdayRaw = body['workday'];
    if (workdayRaw is! Map<String, dynamic>) {
      throw ApiException(message: '배송 상태를 동기화하지 못했습니다.');
    }
    final attached = reconcile is Map
        ? (reconcile['attached'] as num?)?.toInt() ?? 0
        : 0;
    final detached = reconcile is Map
        ? (reconcile['detached'] as num?)?.toInt() ?? 0
        : 0;
    return WorkdayReconcileResult(
      workday: DeliveryWorkday.fromJson(workdayRaw),
      attached: attached,
      detached: detached,
    );
  }

  @override
  Future<WorkdayRequestEndResult> requestEnd({
    required String workdayId,
    bool forceIncomplete = false,
    String? endIdempotencyKey,
  }) async {
    final body = await _api.postJson(
      '/delivery/workday/$workdayId/request-end',
      {
        'forceIncomplete': forceIncomplete,
        if (endIdempotencyKey != null && endIdempotencyKey.isNotEmpty)
          'endIdempotencyKey': endIdempotencyKey,
      },
    );
    final workdayRaw = body['workday'];
    if (workdayRaw is! Map<String, dynamic>) {
      throw ApiException(message: '배송 종료를 시작하지 못했습니다.');
    }
    return WorkdayRequestEndResult(
      workday: DeliveryWorkday.fromJson(workdayRaw),
      alreadyEnded: body['alreadyEnded'] as bool? ?? false,
      alreadyEnding: body['alreadyEnding'] as bool? ?? false,
      requiresClientSessionEnd:
          body['requiresClientSessionEnd'] as bool? ?? false,
    );
  }

  @override
  Future<DeliveryWorkday> finalize(String workdayId) async {
    final body =
        await _api.postJson('/delivery/workday/$workdayId/finalize', {});
    final workday = body['workday'];
    if (workday is! Map<String, dynamic>) {
      throw ApiException(message: '배송 종료를 확정하지 못했습니다.');
    }
    return DeliveryWorkday.fromJson(workday);
  }

  @override
  Future<Map<String, dynamic>> fetchReport(String workdayId) async {
    return _api.getJson('/delivery/workday/$workdayId/report');
  }

  @override
  Future<Map<String, dynamic>> fetchRoute(String workdayId) async {
    return _api.getJson('/delivery/workday/$workdayId/route');
  }
}
