import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'pin_visual_status.dart';

/// Builds high-res pin bitmaps with quantity drawn in the white circle.
///
/// Cached by (quantity, visualStatus) so marker style updates stay cheap.
class QuantityPinIconFactory {
  QuantityPinIconFactory._();

  static const _outputSize = 128;
  static const _fontFamily = 'DeliveryPinQty';
  static final Map<String, Uint8List> _cache = {};
  static Future<void>? _fontLoad;

  static void clearCache() => _cache.clear();

  static Future<void> _ensureFont() {
    return _fontLoad ??= () async {
      const candidates = <String>[
        r'C:\Windows\Fonts\arialbd.ttf',
        r'C:\Windows\Fonts\arial.ttf',
        '/system/fonts/Roboto-Bold.ttf',
        '/system/fonts/Roboto-Regular.ttf',
        '/system/fonts/NotoSansCJK-Regular.ttc',
      ];
      for (final path in candidates) {
        try {
          final file = File(path);
          if (!file.existsSync()) continue;
          final bytes = await file.readAsBytes();
          final loader = FontLoader(_fontFamily)
            ..addFont(Future<ByteData>.value(ByteData.sublistView(bytes)));
          await loader.load();
          return;
        } catch (_) {}
      }
    }();
  }

  static Color _pinColor(PinVisualStatus status) {
    switch (status) {
      case PinVisualStatus.open:
        return const Color(0xFFE53935);
      case PinVisualStatus.completed:
        // Low-chroma gray; still visible, clearly "done".
        return const Color(0xFF9E9E9E);
      case PinVisualStatus.failed:
        return const Color(0xFFFB8C00);
      case PinVisualStatus.retry:
        return const Color(0xFF8E24AA);
    }
  }

  static double _pinOpacity(PinVisualStatus status) {
    switch (status) {
      case PinVisualStatus.completed:
        return 0.72;
      case PinVisualStatus.open:
      case PinVisualStatus.failed:
      case PinVisualStatus.retry:
        return 1.0;
    }
  }

  static String _qtyLabel(int quantity) {
    if (quantity < 1) return '1';
    if (quantity > 99) return '99+';
    return '$quantity';
  }

  static Future<Uint8List> bytesForQuantity(
    int quantity, {
    PinVisualStatus status = PinVisualStatus.open,
  }) async {
    final label = _qtyLabel(quantity);
    final cacheKey = '${status.styleKey}:$label';
    final cached = _cache[cacheKey];
    if (cached != null) return cached;

    await _ensureFont();

    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder);
    final size = _outputSize.toDouble();
    final opacity = _pinOpacity(status);

    canvas.drawRect(
      Rect.fromLTWH(0, 0, size, size),
      Paint()..color = const Color(0x00000000),
    );

    final pinPaint = Paint()
      ..color = _pinColor(status).withValues(alpha: opacity)
      ..style = PaintingStyle.fill
      ..isAntiAlias = true;

    final headCenter = Offset(size * 0.5, size * 0.38);
    final headRadius = size * 0.30;
    canvas.drawCircle(headCenter, headRadius, pinPaint);

    final tip = Path()
      ..moveTo(size * 0.28, size * 0.48)
      ..lineTo(size * 0.50, size * 0.92)
      ..lineTo(size * 0.72, size * 0.48)
      ..close();
    canvas.drawPath(tip, pinPaint);

    canvas.drawCircle(
      headCenter,
      headRadius * 0.62,
      Paint()
        ..color = Colors.white.withValues(alpha: opacity)
        ..isAntiAlias = true,
    );

    final fontSize = label.length >= 3 ? 30.0 : (label.length == 2 ? 38.0 : 46.0);
    final painter = TextPainter(
      text: TextSpan(
        text: label,
        style: TextStyle(
          color: const Color(0xFF111111).withValues(alpha: opacity),
          fontSize: fontSize,
          fontWeight: FontWeight.w900,
          fontFamily: _fontFamily,
          height: 1.0,
        ),
      ),
      textAlign: TextAlign.center,
      textDirection: TextDirection.ltr,
    )..layout();

    painter.paint(
      canvas,
      Offset(
        headCenter.dx - painter.width / 2,
        headCenter.dy - painter.height / 2,
      ),
    );

    final picture = recorder.endRecording();
    final out = await picture.toImage(_outputSize, _outputSize);
    final byteData = await out.toByteData(format: ui.ImageByteFormat.png);
    out.dispose();

    final bytes = byteData!.buffer.asUint8List();
    _cache[cacheKey] = bytes;
    return bytes;
  }

  static String styleIdForQuantity(
    int quantity, {
    PinVisualStatus status = PinVisualStatus.open,
  }) {
    final label = quantity < 1
        ? '1'
        : (quantity > 99 ? '99p' : '$quantity');
    return 'delivery_pin_${status.styleKey}_$label';
  }
}
