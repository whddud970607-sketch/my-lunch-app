import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../copy/driver_chrome_copy.dart';
import '../theme/app_colors.dart';
import '../theme/app_radius.dart';
import '../theme/app_spacing.dart';
import '../widgets/ds_card.dart';
import '../widgets/ds_primary_button.dart';
import 'scanner_camera_host.dart';
import 'scanner_keys.dart';
import 'scanner_mobile_camera.dart';
import 'scanner_session.dart';

/// Driver scanner tab. Camera runs only while this tab is active and resumed.
class ScannerScreen extends StatefulWidget {
  const ScannerScreen({
    super.key,
    this.tabIndex,
    this.scanTabIndex = 3,
    this.session,
    this.cameraHost,
    this.onRegisterByAddress,
  });

  final ValueListenable<int>? tabIndex;
  final int scanTabIndex;
  final ScannerSession? session;
  final ScannerCameraHost? cameraHost;
  final VoidCallback? onRegisterByAddress;

  @override
  State<ScannerScreen> createState() => _ScannerScreenState();
}

class _ScannerScreenState extends State<ScannerScreen>
    with WidgetsBindingObserver {
  late final ScannerSession _session;
  late final ScannerCameraHost _host;
  late final bool _ownsSession;
  late final bool _ownsHost;

  bool _appForeground = true;
  int _syncEpoch = 0;

  bool get _tabActive {
    final tabIndex = widget.tabIndex;
    if (tabIndex == null) return true;
    return tabIndex.value == widget.scanTabIndex;
  }

  @override
  void initState() {
    super.initState();
    _ownsSession = widget.session == null;
    _ownsHost = widget.cameraHost == null;
    _session = widget.session ?? ScannerSession();
    _host = widget.cameraHost ?? MobileScannerCameraHost();
    _session.addListener(_onSession);
    widget.tabIndex?.addListener(_onTabIndex);
    WidgetsBinding.instance.addObserver(this);
    _host.listenable?.addListener(_onHost);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _syncCamera();
    });
  }

  @override
  void didUpdateWidget(ScannerScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.tabIndex != widget.tabIndex) {
      oldWidget.tabIndex?.removeListener(_onTabIndex);
      widget.tabIndex?.addListener(_onTabIndex);
      _syncCamera();
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    switch (state) {
      case AppLifecycleState.resumed:
        _appForeground = true;
        _syncCamera();
      case AppLifecycleState.inactive:
      case AppLifecycleState.hidden:
      case AppLifecycleState.paused:
      case AppLifecycleState.detached:
        _appForeground = false;
        _syncCamera();
    }
  }

  void _onSession() {
    if (mounted) setState(() {});
  }

  void _onTabIndex() {
    _syncCamera();
    if (mounted) setState(() {});
  }

  void _onHost() {
    if (mounted) setState(() {});
  }

  Future<void> _syncCamera() async {
    final epoch = ++_syncEpoch;
    try {
      if (!_tabActive || !_appForeground) {
        await _host.stop();
        return;
      }
      switch (_session.state) {
        case ScannerViewState.detected:
          await _host.pause();
          return;
        case ScannerViewState.permissionDenied:
        case ScannerViewState.cameraUnavailable:
        case ScannerViewState.error:
          await _host.stop();
          return;
        case ScannerViewState.initializing:
        case ScannerViewState.scanning:
          await _host.start();
          if (!mounted || epoch != _syncEpoch) {
            await _host.stop();
            return;
          }
          _session.markScanning();
      }
    } on ScannerCameraException catch (e) {
      if (!mounted || epoch != _syncEpoch) return;
      _session.markFailure(e.failure);
    } catch (_) {
      if (!mounted || epoch != _syncEpoch) return;
      _session.markFailure(ScannerCameraFailure.initFailed);
    }
  }

  void _onDetect(ScannerDetectedCode code) {
    final accepted = _session.acceptDetection(
      rawValue: code.rawValue,
      formatLabel: code.formatLabel,
    );
    if (accepted) {
      _host.pause();
    }
  }

  Future<void> _rescan() async {
    _session.rescan();
    await _syncCamera();
  }

  Future<void> _retry() async {
    _session.retryAfterFailure();
    await _syncCamera();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    widget.tabIndex?.removeListener(_onTabIndex);
    _session.removeListener(_onSession);
    _host.listenable?.removeListener(_onHost);
    _host.stop();
    if (_ownsHost) {
      _host.dispose();
    }
    if (_ownsSession) {
      _session.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: ScannerKeys.screen,
      appBar: AppBar(
        title: const Text('스캔'),
        actions: [
          if (_session.state == ScannerViewState.scanning &&
              _host.torchAvailable)
            IconButton(
              key: ScannerKeys.torch,
              tooltip: _host.torchEnabled ? '조명 끄기' : '조명 켜기',
              onPressed: () {
                _host.toggleTorch().then((_) {
                  if (mounted) setState(() {});
                });
              },
              icon: Icon(
                _host.torchEnabled ? Icons.flash_on : Icons.flash_off,
              ),
            ),
        ],
      ),
      body: Stack(
        fit: StackFit.expand,
        children: [
          ColoredBox(
            color: AppColors.background,
            child: KeyedSubtree(
              key: ScannerKeys.preview,
              child: _host.buildPreview(onDetect: _onDetect),
            ),
          ),
          const _ScannerFrameOverlay(),
          _buildForeground(context),
        ],
      ),
    );
  }

  Widget _buildForeground(BuildContext context) {
    switch (_session.state) {
      case ScannerViewState.initializing:
        return const _StatusOverlay(
          key: ScannerKeys.initializing,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              CircularProgressIndicator(),
              SizedBox(height: AppSpacing.md),
              Text('카메라를 준비하는 중'),
            ],
          ),
        );
      case ScannerViewState.scanning:
        return Stack(
          children: [
            const Align(
              alignment: Alignment.topCenter,
              child: Padding(
                padding: EdgeInsets.fromLTRB(
                  AppSpacing.lg,
                  AppSpacing.lg,
                  AppSpacing.lg,
                  0,
                ),
                child: Text(
                  '바코드를 프레임 안에 맞춰 주세요',
                  key: ScannerKeys.instruction,
                  textAlign: TextAlign.center,
                ),
              ),
            ),
            Align(
              alignment: Alignment.bottomCenter,
              child: _RegisterByAddressCta(
                padded: true,
                onPressed: widget.onRegisterByAddress,
              ),
            ),
          ],
        );
      case ScannerViewState.detected:
        return Align(
          alignment: Alignment.bottomCenter,
          child: SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(AppSpacing.lg),
              child: DsCard(
                key: ScannerKeys.detected,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      '코드가 인식되었습니다',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    Text(
                      _session.detectedValue ?? '',
                      key: ScannerKeys.detectedValue,
                      style: Theme.of(context).textTheme.bodyLarge,
                    ),
                    if (_session.detectedFormatLabel != null) ...[
                      const SizedBox(height: AppSpacing.xs),
                      Text(
                        _session.detectedFormatLabel!,
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                    const SizedBox(height: AppSpacing.md),
                    DsPrimaryButton(
                      key: ScannerKeys.rescan,
                      label: '다시 스캔',
                      onPressed: () {
                        _rescan();
                      },
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    _RegisterByAddressCta(
                      onPressed: widget.onRegisterByAddress,
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      case ScannerViewState.permissionDenied:
        return _MessageOverlay(
          key: ScannerKeys.permissionDenied,
          title: '카메라 권한이 필요합니다',
          body: _session.permanentlyDenied
              ? '설정에서 카메라를 허용한 뒤 다시 시도해 주세요.'
              : '스캔하려면 카메라 권한을 허용해 주세요.',
          actionKey: ScannerKeys.permissionRetry,
          actionLabel: '다시 시도',
          onAction: () {
            _retry();
          },
          onRegisterByAddress: widget.onRegisterByAddress,
        );
      case ScannerViewState.cameraUnavailable:
        return _MessageOverlay(
          key: ScannerKeys.cameraUnavailable,
          title: '카메라를 사용할 수 없습니다',
          body: '이 기기에서 카메라를 열 수 없습니다. 다른 기능은 계속 사용할 수 있습니다.',
          onRegisterByAddress: widget.onRegisterByAddress,
        );
      case ScannerViewState.error:
        return _MessageOverlay(
          key: ScannerKeys.error,
          title: '스캐너를 시작할 수 없습니다',
          body: '카메라를 다시 시도해 주세요. 앱은 계속 사용할 수 있습니다.',
          actionKey: ScannerKeys.errorRetry,
          actionLabel: '다시 시도',
          onAction: () {
            _retry();
          },
          onRegisterByAddress: widget.onRegisterByAddress,
        );
    }
  }
}

class _ScannerFrameOverlay extends StatelessWidget {
  const _ScannerFrameOverlay();

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: CustomPaint(
        key: ScannerKeys.frame,
        painter: _ScannerFramePainter(),
        child: const SizedBox.expand(),
      ),
    );
  }
}

class _ScannerFramePainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final holeWidth = size.width * 0.78;
    final holeHeight = size.height * 0.36;
    final hole = RRect.fromRectAndRadius(
      Rect.fromCenter(
        center: Offset(size.width / 2, size.height * 0.42),
        width: holeWidth,
        height: holeHeight,
      ),
      const Radius.circular(AppRadius.lg),
    );

    final overlay = Path()
      ..fillType = PathFillType.evenOdd
      ..addRect(Offset.zero & size)
      ..addRRect(hole);
    canvas.drawPath(
      overlay,
      Paint()
        ..color = Colors.black.withValues(alpha: 0.45)
        ..style = PaintingStyle.fill,
    );

    canvas.drawRRect(
      hole,
      Paint()
        ..color = AppColors.primary
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _StatusOverlay extends StatelessWidget {
  const _StatusOverlay({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: Colors.black.withValues(alpha: 0.35),
      child: Center(child: child),
    );
  }
}

class _MessageOverlay extends StatelessWidget {
  const _MessageOverlay({
    super.key,
    required this.title,
    required this.body,
    this.actionKey,
    this.actionLabel,
    this.onAction,
    this.onRegisterByAddress,
  });

  final String title;
  final String body;
  final Key? actionKey;
  final String? actionLabel;
  final VoidCallback? onAction;
  final VoidCallback? onRegisterByAddress;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Center(
        child: DsCard(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(title, style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: AppSpacing.sm),
              Text(body, style: Theme.of(context).textTheme.bodyMedium),
              if (actionLabel != null && onAction != null) ...[
                const SizedBox(height: AppSpacing.md),
                DsPrimaryButton(
                  key: actionKey,
                  label: actionLabel!,
                  onPressed: onAction,
                ),
              ],
              const SizedBox(height: AppSpacing.sm),
              _RegisterByAddressCta(onPressed: onRegisterByAddress),
            ],
          ),
        ),
      ),
    );
  }
}

class _RegisterByAddressCta extends StatelessWidget {
  const _RegisterByAddressCta({this.onPressed, this.padded = false});

  final VoidCallback? onPressed;
  final bool padded;

  @override
  Widget build(BuildContext context) {
    final button = OutlinedButton(
      key: ScannerKeys.registerByAddress,
      onPressed: onPressed,
      child: const Text(DriverChromeCopy.registerByAddress),
    );
    if (!padded) return button;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.lg,
          0,
          AppSpacing.lg,
          AppSpacing.lg,
        ),
        child: button,
      ),
    );
  }
}
