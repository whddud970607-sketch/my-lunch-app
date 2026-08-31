import 'package:flutter/material.dart';

import 'completion_enqueue_service.dart';
import 'completion_projection_store.dart';
import 'operation_sync_engine.dart';

/// Provides app-scoped sync services without Map ownership.
class SyncScope extends InheritedWidget {
  const SyncScope({
    super.key,
    required this.syncEngine,
    required this.projections,
    required this.completionEnqueue,
    required super.child,
  });

  final OperationSyncEngine syncEngine;
  final CompletionProjectionStore projections;
  final CompletionEnqueueService completionEnqueue;

  static SyncScope? maybeOf(BuildContext context) {
    return context.dependOnInheritedWidgetOfExactType<SyncScope>();
  }

  static SyncScope of(BuildContext context) {
    final scope = maybeOf(context);
    assert(scope != null, 'SyncScope not found');
    return scope!;
  }

  @override
  bool updateShouldNotify(SyncScope oldWidget) {
    return syncEngine != oldWidget.syncEngine ||
        projections != oldWidget.projections ||
        completionEnqueue != oldWidget.completionEnqueue;
  }
}
