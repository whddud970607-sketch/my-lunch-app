import 'package:flutter/foundation.dart';

/// Optimistic local completion projection (feature-flag path only).
enum LocalCompletionSyncPhase {
  /// Shown as completed; sync still pending.
  syncPending,
  synced,
  failed,
  conflict,
}

class LocalCompletionProjection {
  const LocalCompletionProjection({
    required this.pointId,
    required this.phase,
    this.errorCode,
  });

  final String pointId;
  final LocalCompletionSyncPhase phase;
  final String? errorCode;
}

/// In-memory projections keyed by pointId for the active driver session.
class CompletionProjectionStore extends ChangeNotifier {
  final Map<String, LocalCompletionProjection> _byPoint = {};

  LocalCompletionProjection? forPoint(String pointId) => _byPoint[pointId];

  void markPending(String pointId) {
    _byPoint[pointId] = LocalCompletionProjection(
      pointId: pointId,
      phase: LocalCompletionSyncPhase.syncPending,
    );
    notifyListeners();
  }

  void markSynced(String pointId) {
    _byPoint[pointId] = LocalCompletionProjection(
      pointId: pointId,
      phase: LocalCompletionSyncPhase.synced,
    );
    notifyListeners();
  }

  void markFailed(String pointId, {String? errorCode, bool conflict = false}) {
    _byPoint[pointId] = LocalCompletionProjection(
      pointId: pointId,
      phase: conflict
          ? LocalCompletionSyncPhase.conflict
          : LocalCompletionSyncPhase.failed,
      errorCode: errorCode,
    );
    notifyListeners();
  }

  void clearPoint(String pointId) {
    _byPoint.remove(pointId);
    notifyListeners();
  }

  void clearAll() {
    _byPoint.clear();
    notifyListeners();
  }
}
