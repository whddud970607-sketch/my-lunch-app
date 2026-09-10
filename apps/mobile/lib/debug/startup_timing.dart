import 'dart:async';

import 'package:flutter/services.dart';

/// Debug-safe cold-start timing markers (PERF-S1).
///
/// Logs only mark names + monotonic durations. Never logs secrets, tokens,
/// identity, or delivery payloads.
class StartupTiming {
  StartupTiming._();

  static const _tag = 'DS_PERF';
  static const _channel = MethodChannel('delivery_shield/device');

  static final Stopwatch _fromMain = Stopwatch();
  static int? _processStartElapsedMs;
  static int? _lastElapsedRealtimeMs;
  static final Set<String> _once = <String>{};

  /// Starts monotonic clock immediately; hydrates process elapsed off the
  /// critical path (MethodChannel must not delay AppConfig / runApp).
  static Future<void> markMainStart() async {
    _fromMain
      ..reset()
      ..start();
    _emit('DART_MAIN_START');
    unawaited(_hydrateProcessTiming());
  }

  static Future<void> _hydrateProcessTiming() async {
    _processStartElapsedMs = await _invokeInt('processStartElapsedMs');
    await _refreshElapsedCache();
  }

  /// Safe from build/initState — never awaits a platform channel before logging.
  static void markSync(String name, {bool once = false}) {
    if (once && !_once.add(name)) return;
    _emit(name);
    unawaited(_refreshElapsedCache());
  }

  static Future<void> mark(String name, {bool once = false}) async {
    if (once && !_once.add(name)) return;
    await _refreshElapsedCache();
    _emit(name);
  }

  static void _emit(String name) {
    final fromMainMs = _fromMain.isRunning ? _fromMain.elapsedMilliseconds : -1;
    final wallMs = DateTime.now().millisecondsSinceEpoch;
    final elapsedRt = _estimateElapsedRealtimeMs();
    final processMs = (_processStartElapsedMs != null && elapsedRt >= 0)
        ? elapsedRt - _processStartElapsedMs!
        : -1;
    // ignore: avoid_print — release logcat measurement requires print
    print(
      '$_tag mark=$name from_main_ms=$fromMainMs process_ms=$processMs '
      'elapsed_realtime_ms=$elapsedRt wall_ms=$wallMs',
    );
  }

  static int _estimateElapsedRealtimeMs() {
    if (_lastElapsedRealtimeMs != null) return _lastElapsedRealtimeMs!;
    if (_processStartElapsedMs == null) return -1;
    return _processStartElapsedMs! +
        (_fromMain.isRunning ? _fromMain.elapsedMilliseconds : 0);
  }

  static Future<void> _refreshElapsedCache() async {
    final v = await _invokeInt('elapsedRealtimeMs');
    if (v != null) _lastElapsedRealtimeMs = v;
  }

  static Future<int?> _invokeInt(String method) async {
    try {
      final v = await _channel.invokeMethod<dynamic>(method);
      if (v is int) return v;
      if (v is num) return v.toInt();
      return null;
    } catch (_) {
      return null;
    }
  }

  /// Span duration log (no payloads / secrets).
  static void markDuration(String name, int durationMs, {bool once = false}) {
    if (once && !_once.add(name)) return;
    final fromMainMs = _fromMain.isRunning ? _fromMain.elapsedMilliseconds : -1;
    final wallMs = DateTime.now().millisecondsSinceEpoch;
    // ignore: avoid_print — release logcat measurement requires print
    print(
      '$_tag mark=$name duration_ms=$durationMs from_main_ms=$fromMainMs '
      'wall_ms=$wallMs',
    );
  }
}
