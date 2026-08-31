import 'sync_operation.dart';

enum DispatchOutcomeKind {
  success,
  transientFailure,
  authWait,
  permanentFailure,
  conflict,
}

class DispatchOutcome {
  const DispatchOutcome({
    required this.kind,
    this.errorCode,
    this.result,
  });

  final DispatchOutcomeKind kind;
  final String? errorCode;

  /// Durable result for dependents (e.g. `{storagePath: ...}`). No PII/GPS.
  final Map<String, dynamic>? result;

  factory DispatchOutcome.success({Map<String, dynamic>? result}) =>
      DispatchOutcome(kind: DispatchOutcomeKind.success, result: result);

  factory DispatchOutcome.fail(DispatchOutcomeKind kind, String errorCode) =>
      DispatchOutcome(kind: kind, errorCode: errorCode);
}

abstract class OperationDispatcher {
  Future<DispatchOutcome> dispatch(SyncOperation operation);
}

/// Records calls; returns configurable outcomes for tests.
class FakeOperationDispatcher implements OperationDispatcher {
  FakeOperationDispatcher({
    this.outcomeBuilder,
  });

  DispatchOutcome Function(SyncOperation op)? outcomeBuilder;

  final List<String> dispatchedOperationIds = [];

  @override
  Future<DispatchOutcome> dispatch(SyncOperation operation) async {
    dispatchedOperationIds.add(operation.operationId);
    final builder = outcomeBuilder;
    if (builder != null) return builder(operation);
    return DispatchOutcome.success();
  }
}

/// Routes by [OperationType] to typed dispatchers.
class CompositeOperationDispatcher implements OperationDispatcher {
  CompositeOperationDispatcher(this._byType);

  final Map<String, OperationDispatcher> _byType;

  @override
  Future<DispatchOutcome> dispatch(SyncOperation operation) {
    final d = _byType[operation.operationType.name];
    if (d == null) {
      return Future.value(
        DispatchOutcome.fail(
          DispatchOutcomeKind.permanentFailure,
          'no_dispatcher',
        ),
      );
    }
    return d.dispatch(operation);
  }
}
