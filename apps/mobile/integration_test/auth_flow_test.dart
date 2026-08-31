import 'package:delivery_shield_mobile/config/app_config.dart';
import 'package:delivery_shield_mobile/location/driver_location_service.dart';
import 'package:delivery_shield_mobile/main.dart';
import 'package:delivery_shield_mobile/services/api_client.dart';
import 'package:delivery_shield_mobile/services/auth_service.dart';
import 'package:delivery_shield_mobile/services/delivery_session_service.dart';
import 'package:delivery_shield_mobile/services/delivery_workday_repository.dart';
import 'package:delivery_shield_mobile/services/me_service.dart';
import 'package:delivery_shield_mobile/state/auth_controller.dart';
import 'package:delivery_shield_mobile/state/delivery_session_controller.dart';
import 'package:delivery_shield_mobile/sync/completion_enqueue_service.dart';
import 'package:delivery_shield_mobile/sync/completion_projection_store.dart';
import 'package:delivery_shield_mobile/sync/operation_sync_engine.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('Phase 1D login -> /v1/me -> home -> logout', (tester) async {
    const email = String.fromEnvironment('E2E_EMAIL');
    const password = String.fromEnvironment('E2E_PASSWORD');
    expect(email.isNotEmpty, isTrue, reason: 'E2E_EMAIL dart-define missing');
    expect(password.isNotEmpty, isTrue, reason: 'E2E_PASSWORD dart-define missing');

    await AppConfig.load();
    final auth = AuthService();
    await auth.initialize();

    late final AuthController controller;
    final api = ApiClient(
      tokenProvider: auth.accessToken,
      onUnauthorized: () async {
        await controller.handleUnauthorized();
      },
    );
    controller = AuthController(
      authService: auth,
      apiClient: api,
      meService: MeService(api),
    );
    await controller.bootstrap();

    await controller.signIn(email, password);
    expect(controller.state, AuthViewState.signedIn);
    expect(controller.me, isNotNull);
    expect(controller.me!.isDriver, isTrue);
    expect(controller.me!.driver, isNotNull);
    expect(controller.me!.role, 'driver');

    final sessionController = DeliverySessionController(
      sessionService: DeliverySessionService(api),
      workdayRepository: DeliveryWorkdayRepository(api),
      locationService: DriverLocationService(),
    );
    final syncEngine = OperationSyncEngine();
    final projections = CompletionProjectionStore();
    final enqueue = CompletionEnqueueService(
      syncEngine: syncEngine,
      projections: projections,
    );

    await tester.pumpWidget(
      DeliveryShieldApp(
        controller: controller,
        sessionController: sessionController,
        syncEngine: syncEngine,
        projections: projections,
        completionEnqueue: enqueue,
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('기사 홈'), findsOneWidget);
    expect(find.textContaining('role: driver'), findsOneWidget);
    expect(auth.currentSession, isNotNull);

    await sessionController.onSignOut();
    await controller.signOut();
    await tester.pumpAndSettle();
    expect(controller.state, AuthViewState.signedOut);
    expect(find.text('기사 로그인'), findsOneWidget);
  });
}
