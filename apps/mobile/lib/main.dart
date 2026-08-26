import 'package:flutter/material.dart';
import 'package:kakao_maps_flutter/kakao_maps_flutter.dart';

import 'config/app_config.dart';
import 'config/device_abi.dart';
import 'screens/auth_gate.dart';
import 'services/api_client.dart';
import 'services/auth_service.dart';
import 'services/me_service.dart';
import 'state/auth_controller.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  try {
    await AppConfig.load();
    // Kakao Map Android SDK has no x86_64 .so — never init on unsupported ABI
    // or the process dies with UnsatisfiedLinkError (libK3fAndroid.so).
    final kakaoNativeOk = await DeviceAbi.isKakaoMapNativeSupported();
    if (kakaoNativeOk) {
      await KakaoMapsFlutter.init(AppConfig.instance.kakaoNativeAppKey);
    }
  } catch (e) {
    runApp(_BootErrorApp(message: e.toString()));
    return;
  }

  final auth = AuthService();
  await auth.initialize();

  late final AuthController controller;
  final api = ApiClient(
    tokenProvider: auth.accessToken,
    onUnauthorized: () async {
      await controller.handleUnauthorized();
    },
  );
  final me = MeService(api);
  controller = AuthController(
    authService: auth,
    apiClient: api,
    meService: me,
  );

  await controller.bootstrap();

  runApp(DeliveryShieldApp(controller: controller));
}

class DeliveryShieldApp extends StatelessWidget {
  const DeliveryShieldApp({super.key, required this.controller});

  final AuthController controller;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Delivery Shield',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF0F6B4C)),
        useMaterial3: true,
      ),
      home: AuthGate(controller: controller),
    );
  }
}

class _BootErrorApp extends StatelessWidget {
  const _BootErrorApp({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      home: Scaffold(
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              message,
              textAlign: TextAlign.center,
            ),
          ),
        ),
      ),
    );
  }
}
