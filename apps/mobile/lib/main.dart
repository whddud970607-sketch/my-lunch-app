import 'dart:async';

import 'package:flutter/material.dart';

import 'config/app_config.dart';
import 'debug/startup_timing.dart';
import 'location/driver_location_service.dart';
import 'map/map_sdk_bootstrap.dart';
import 'screens/auth_gate.dart';
import 'theme/app_theme.dart';
import 'services/api_client.dart';
import 'services/auth_service.dart';
import 'services/delivery_session_service.dart';
import 'services/delivery_workday_repository.dart';
import 'services/me_service.dart';
import 'state/auth_controller.dart';
import 'state/delivery_session_controller.dart';
import 'sync/completion_enqueue_service.dart';
import 'sync/completion_projection_store.dart';
import 'sync/composite_dispatch_setup.dart';
import 'sync/operation_dispatcher.dart';
import 'sync/operation_sync_engine.dart';
import 'sync/operation_type.dart';
import 'sync/sync_scope.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await StartupTiming.markMainStart();

  try {
    await AppConfig.load();
    await StartupTiming.mark('CONFIG_READY');
  } catch (e) {
    runApp(_BootErrorApp(message: e.toString()));
    return;
  }

  final auth = AuthService();
  await StartupTiming.mark('SUPABASE_INIT_START');
  await auth.initialize();
  await StartupTiming.mark('SUPABASE_READY');

  late final AuthController controller;
  final api = ApiClient(
    tokenProvider: auth.accessToken,
    onUnauthorized: () async {
      await controller.handleUnauthorized();
    },
  );
  final me = MeService(api);
  controller = AuthController(authService: auth, apiClient: api, meService: me);

  final locationService = DriverLocationService();
  final sessionService = DeliverySessionService(api);
  final workdayRepository = DeliveryWorkdayRepository(api);
  final sessionController = DeliverySessionController(
    sessionService: sessionService,
    workdayRepository: workdayRepository,
    locationService: locationService,
  );

  final projections = CompletionProjectionStore();
  final syncEngine = OperationSyncEngine(
    onOperationSettled: (op, outcome) {
      if (op.operationType != OperationType.deliveryComplete) return;
      final pointId = op.entityId;
      switch (outcome.kind) {
        case DispatchOutcomeKind.success:
          projections.markSynced(pointId);
        case DispatchOutcomeKind.permanentFailure:
          projections.markFailed(pointId, errorCode: outcome.errorCode);
        case DispatchOutcomeKind.conflict:
          projections.markFailed(
            pointId,
            errorCode: outcome.errorCode,
            conflict: true,
          );
        case DispatchOutcomeKind.transientFailure:
        case DispatchOutcomeKind.authWait:
          break;
      }
    },
  );
  syncEngine.setDispatcher(buildDeliveryDispatchers(api));
  final completionEnqueue = CompletionEnqueueService(
    syncEngine: syncEngine,
    projections: projections,
  );

  // PERF-S1: first frame before profile/session/map SDK work.
  await StartupTiming.mark('RUN_APP');
  runApp(
    DeliveryShieldApp(
      controller: controller,
      sessionController: sessionController,
      syncEngine: syncEngine,
      projections: projections,
      completionEnqueue: completionEnqueue,
    ),
  );

  // Map SDKs are not required for auth shell / home chrome.
  unawaited(MapSdkBootstrap.ensureInitialized());

  unawaited(() async {
    await StartupTiming.mark('AUTH_STATE_START');
    await controller.bootstrap();
    await StartupTiming.mark('AUTH_STATE_READY');
    // Session restore runs in AuthGate after signedIn (avoids blocking shell).
  }());
}

class DeliveryShieldApp extends StatefulWidget {
  const DeliveryShieldApp({
    super.key,
    required this.controller,
    required this.sessionController,
    required this.syncEngine,
    required this.projections,
    required this.completionEnqueue,
  });

  final AuthController controller;
  final DeliverySessionController sessionController;
  final OperationSyncEngine syncEngine;
  final CompletionProjectionStore projections;
  final CompletionEnqueueService completionEnqueue;

  @override
  State<DeliveryShieldApp> createState() => _DeliveryShieldAppState();
}

class _DeliveryShieldAppState extends State<DeliveryShieldApp> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      StartupTiming.markSync('FIRST_FLUTTER_FRAME', once: true);
    });
  }

  @override
  Widget build(BuildContext context) {
    return SyncScope(
      syncEngine: widget.syncEngine,
      projections: widget.projections,
      completionEnqueue: widget.completionEnqueue,
      child: MaterialApp(
        title: 'Delivery Shield',
        theme: AppTheme.dark(),
        home: AuthGate(
          controller: widget.controller,
          sessionController: widget.sessionController,
          syncEngine: widget.syncEngine,
          projections: widget.projections,
        ),
      ),
    );
  }
}

class _BootErrorApp extends StatelessWidget {
  const _BootErrorApp({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      theme: AppTheme.dark(),
      home: Scaffold(
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(message, textAlign: TextAlign.center),
          ),
        ),
      ),
    );
  }
}
