import '../sync/completion_projection_store.dart';
import '../models/map_spike_point.dart';

/// Reconciles server Today/map points with local optimistic Complete projections.
class WorksetCompletionReconciler {
  const WorksetCompletionReconciler._();

  /// Keeps local optimistic completed when sync is still pending.
  /// Permanent failed/conflict → prefer server row (caller restores snapshot).
  static MapSpikePoint mergePoint({
    required MapSpikePoint server,
    required MapSpikePoint? local,
    required LocalCompletionProjection? projection,
  }) {
    if (local == null || projection == null) return server;
    switch (projection.phase) {
      case LocalCompletionSyncPhase.syncPending:
        if (local.isCompleted && !server.isCompleted) {
          return local;
        }
        return server;
      case LocalCompletionSyncPhase.synced:
        return server.isCompleted ? server : local;
      case LocalCompletionSyncPhase.failed:
      case LocalCompletionSyncPhase.conflict:
        return server;
    }
  }

  static Map<String, MapSpikePoint> mergeAll({
    required Iterable<MapSpikePoint> serverPoints,
    required Map<String, MapSpikePoint> previousById,
    required CompletionProjectionStore? projections,
  }) {
    final out = <String, MapSpikePoint>{};
    for (final server in serverPoints) {
      out[server.pointId] = mergePoint(
        server: server,
        local: previousById[server.pointId],
        projection: projections?.forPoint(server.pointId),
      );
    }
    return out;
  }
}
