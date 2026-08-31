import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import 'driver_vehicle_type.dart';

/// Visual tier for GPS accuracy halo (not a meter-scale map overlay).
///
/// Exact accuracy circle on the map is TODO; this only softens the marker halo.
enum DriverGpsAccuracyVisual {
  good,
  fair,
  poor;

  static DriverGpsAccuracyVisual fromMeters(double? accuracyMeters) {
    if (accuracyMeters == null || accuracyMeters <= 0) {
      return DriverGpsAccuracyVisual.good;
    }
    if (accuracyMeters <= 20) return DriverGpsAccuracyVisual.good;
    if (accuracyMeters <= 40) return DriverGpsAccuracyVisual.fair;
    return DriverGpsAccuracyVisual.poor;
  }
}

/// Delivery Shield navigation-style driver marker bitmaps for Kakao/Naver.
///
/// Vehicles are drawn facing **north (up)**. Rotation uses GPS heading
/// (0=N, 90=E, clockwise). Kakao bakes vehicle rotation into the bitmap while
/// keeping the circular base/halo upright. Naver uses a north-facing bitmap
/// plus native marker angle.
///
/// PNG assets under [DriverVehicleType.markerAssetPath] are north-facing
/// reference exports for future TMAP reuse; runtime rendering is composed here.
class DriverLocationIconFactory {
  DriverLocationIconFactory._();

  /// Logical bitmap size; displayed ~42–48dp on map adapters.
  static const outputSize = 128;
  static const headingBucketDegrees = 5;

  /// Shared Delivery Shield palette (not map-provider brand colors).
  static const _discFill = Color(0xFFF4F7FB);
  static const _discBorder = Color(0xFF1E88E5);
  static const _halo = Color(0xFF1565C0);
  static const _vehicleBody = Color(0xFF0D47A1);
  static const _vehicleAccent = Color(0xFF42A5F5);
  static const _vehicleHighlight = Color(0xFFE3F2FD);
  static const _headlight = Color(0xFFFFC107);
  static const _sessionRing = Color(0xFF1565C0);

  static final Map<String, Uint8List> _rotatedCache = {};
  static final Map<String, Uint8List> _baseCache = {};

  static void clearCache() {
    _rotatedCache.clear();
    _baseCache.clear();
  }

  static int bucketHeading(double? headingDegrees) {
    if (headingDegrees == null) return -1;
    return (headingDegrees / headingBucketDegrees).round() *
        headingBucketDegrees %
        360;
  }

  static String cacheKey({
    required DriverVehicleType vehicle,
    required int headingBucket,
    required DriverGpsAccuracyVisual accuracy,
    required bool sessionActive,
  }) =>
      '${vehicle.name}:h$headingBucket:a${accuracy.name}:s$sessionActive';

  /// North-facing composed marker (halo + disc + vehicle). For Naver + angle.
  static Future<Uint8List> baseBytesFor(
    DriverVehicleType vehicle, {
    double? accuracyMeters,
    bool sessionActive = false,
  }) {
    return _composeBytes(
      vehicle: vehicle,
      headingDegrees: null,
      accuracy: DriverGpsAccuracyVisual.fromMeters(accuracyMeters),
      sessionActive: sessionActive,
      rotateVehicle: false,
    );
  }

  /// Composed marker with vehicle rotated for Kakao (base/halo stay upright).
  static Future<Uint8List> rotatedBytesFor({
    required DriverVehicleType vehicle,
    double? headingDegrees,
    double? accuracyMeters,
    bool sessionActive = false,
  }) {
    return _composeBytes(
      vehicle: vehicle,
      headingDegrees: headingDegrees,
      accuracy: DriverGpsAccuracyVisual.fromMeters(accuracyMeters),
      sessionActive: sessionActive,
      rotateVehicle: true,
    );
  }

  static Future<Uint8List> _composeBytes({
    required DriverVehicleType vehicle,
    required double? headingDegrees,
    required DriverGpsAccuracyVisual accuracy,
    required bool sessionActive,
    required bool rotateVehicle,
  }) async {
    final bucket = rotateVehicle ? bucketHeading(headingDegrees) : -1;
    final key = cacheKey(
      vehicle: vehicle,
      headingBucket: bucket,
      accuracy: accuracy,
      sessionActive: sessionActive,
    );
    final cache = rotateVehicle ? _rotatedCache : _baseCache;
    final cached = cache[key];
    if (cached != null) return cached;

    final bytes = await _drawComposed(
      vehicle: vehicle,
      headingBucket: bucket,
      accuracy: accuracy,
      sessionActive: sessionActive,
    );
    cache[key] = bytes;
    return bytes;
  }

  static Future<Uint8List> _drawComposed({
    required DriverVehicleType vehicle,
    required int headingBucket,
    required DriverGpsAccuracyVisual accuracy,
    required bool sessionActive,
  }) async {
    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder);
    final size = outputSize.toDouble();
    final center = Offset(size / 2, size / 2);

    _paintHalo(canvas, center, size, accuracy);
    _paintDisc(canvas, center, size, accuracy);
    if (sessionActive) {
      _paintSessionRing(canvas, center, size);
    }

    canvas.save();
    canvas.translate(center.dx, center.dy);
    if (headingBucket >= 0) {
      canvas.rotate(headingBucket * math.pi / 180);
    }
    _paintVehicle(canvas, vehicle, size);
    canvas.restore();

    final picture = recorder.endRecording();
    final image = await picture.toImage(outputSize, outputSize);
    final data = await image.toByteData(format: ui.ImageByteFormat.png);
    image.dispose();
    return data!.buffer.asUint8List();
  }

  static void _paintHalo(
    Canvas canvas,
    Offset center,
    double size,
    DriverGpsAccuracyVisual accuracy,
  ) {
    final alpha = switch (accuracy) {
      DriverGpsAccuracyVisual.good => 0.18,
      DriverGpsAccuracyVisual.fair => 0.12,
      DriverGpsAccuracyVisual.poor => 0.06,
    };
    final radius = switch (accuracy) {
      DriverGpsAccuracyVisual.good => size * 0.48,
      DriverGpsAccuracyVisual.fair => size * 0.46,
      DriverGpsAccuracyVisual.poor => size * 0.44,
    };
    canvas.drawCircle(
      center,
      radius,
      Paint()..color = _halo.withValues(alpha: alpha),
    );
  }

  static void _paintDisc(
    Canvas canvas,
    Offset center,
    double size,
    DriverGpsAccuracyVisual accuracy,
  ) {
    final radius = size * 0.36;
    canvas.drawCircle(center, radius, Paint()..color = _discFill);

    final borderAlpha = switch (accuracy) {
      DriverGpsAccuracyVisual.good => 1.0,
      DriverGpsAccuracyVisual.fair => 0.75,
      DriverGpsAccuracyVisual.poor => 0.45,
    };
    canvas.drawCircle(
      center,
      radius,
      Paint()
        ..color = _discBorder.withValues(alpha: borderAlpha)
        ..style = PaintingStyle.stroke
        ..strokeWidth = size * 0.028,
    );
  }

  static void _paintSessionRing(Canvas canvas, Offset center, double size) {
    // Subtle outer ring reserved for "배송 중"; no blink animation.
    canvas.drawCircle(
      center,
      size * 0.40,
      Paint()
        ..color = _sessionRing.withValues(alpha: 0.35)
        ..style = PaintingStyle.stroke
        ..strokeWidth = size * 0.018,
    );
  }

  /// Vehicle in local coords with origin at center, facing **up (north)**.
  static void _paintVehicle(
    Canvas canvas,
    DriverVehicleType vehicle,
    double size,
  ) {
    switch (vehicle) {
      case DriverVehicleType.truck:
        _drawTruckFacingNorth(canvas, size);
      case DriverVehicleType.motorcycle:
        _drawMotorcycleFacingNorth(canvas, size);
    }
  }

  /// Top-down delivery van; nose toward -Y (north / heading 0).
  static void _drawTruckFacingNorth(Canvas canvas, double size) {
    final s = size;
    final body = Paint()..color = _vehicleBody;
    final accent = Paint()..color = _vehicleAccent;
    final highlight = Paint()..color = _vehicleHighlight;
    final light = Paint()..color = _headlight;

    // Cargo box (rear / south)
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(
          center: Offset(0, s * 0.06),
          width: s * 0.28,
          height: s * 0.30,
        ),
        Radius.circular(s * 0.035),
      ),
      body,
    );
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(
          center: Offset(0, s * 0.02),
          width: s * 0.18,
          height: s * 0.06,
        ),
        Radius.circular(s * 0.02),
      ),
      highlight,
    );

    // Cab (front / north)
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(
          center: Offset(0, -s * 0.14),
          width: s * 0.22,
          height: s * 0.14,
        ),
        Radius.circular(s * 0.03),
      ),
      accent,
    );
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(
          center: Offset(0, -s * 0.155),
          width: s * 0.14,
          height: s * 0.05,
        ),
        Radius.circular(s * 0.015),
      ),
      highlight,
    );

    // Headlights — direction cue
    canvas.drawCircle(Offset(-s * 0.06, -s * 0.21), s * 0.022, light);
    canvas.drawCircle(Offset(s * 0.06, -s * 0.21), s * 0.022, light);

    canvas.drawCircle(Offset(-s * 0.13, -s * 0.12), s * 0.018, body);
    canvas.drawCircle(Offset(s * 0.13, -s * 0.12), s * 0.018, body);
  }

  /// Delivery scooter; nose toward -Y (north). Similar visual weight to truck.
  static void _drawMotorcycleFacingNorth(Canvas canvas, double size) {
    final s = size;
    final body = Paint()..color = _vehicleBody;
    final accent = Paint()..color = _vehicleAccent;
    final highlight = Paint()..color = _vehicleHighlight;
    final light = Paint()..color = _headlight;

    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(
          center: Offset(0, s * 0.12),
          width: s * 0.20,
          height: s * 0.16,
        ),
        Radius.circular(s * 0.03),
      ),
      body,
    );
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(
          center: Offset(0, s * 0.10),
          width: s * 0.12,
          height: s * 0.05,
        ),
        Radius.circular(s * 0.015),
      ),
      highlight,
    );

    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(
          center: Offset(0, -s * 0.02),
          width: s * 0.12,
          height: s * 0.22,
        ),
        Radius.circular(s * 0.04),
      ),
      accent,
    );

    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(
          center: Offset(0, -s * 0.16),
          width: s * 0.26,
          height: s * 0.04,
        ),
        Radius.circular(s * 0.02),
      ),
      body,
    );

    canvas.drawCircle(Offset(0, -s * 0.20), s * 0.045, accent);
    canvas.drawCircle(Offset(0, -s * 0.22), s * 0.02, light);

    canvas.drawCircle(Offset(0, s * 0.22), s * 0.045, body);
    canvas.drawCircle(Offset(0, -s * 0.08), s * 0.04, body);
  }
}
