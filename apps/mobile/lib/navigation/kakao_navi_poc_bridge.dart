import 'dart:convert';

import 'package:flutter/services.dart';

/// Bridge to Android Kakao Mobility in-app navigation (KNNaviView).
///
/// Debug menu may call [launch] without [session] (fixture route).
/// Product 길찾기 passes a [KakaoInAppNavSession] with real workset pins.
class KakaoNaviPocBridge {
  KakaoNaviPocBridge._();

  static const MethodChannel _channel = MethodChannel(
    'delivery_shield/kakao_navi_poc',
  );

  /// Opens native [KNNaviView] activity. Android only; no-op on other platforms.
  static Future<void> launch({
    required String appKey,
    KakaoInAppNavSession? session,
  }) async {
    final args = <String, Object?>{
      'appKey': appKey,
    };
    if (session != null) {
      args['sessionJson'] = jsonEncode(session.toJson());
    }
    await _channel.invokeMethod<void>('launch', args);
  }
}

class KakaoInAppNavSession {
  const KakaoInAppNavSession({
    required this.destinationPointId,
    required this.destinationNumber,
    required this.destinationName,
    required this.destinationLatitude,
    required this.destinationLongitude,
    required this.stops,
    this.startLatitude,
    this.startLongitude,
  });

  final String destinationPointId;
  final int destinationNumber;
  final String destinationName;
  final double destinationLatitude;
  final double destinationLongitude;
  final double? startLatitude;
  final double? startLongitude;
  final List<KakaoInAppNavStop> stops;

  Map<String, Object?> toJson() => {
        'destinationPointId': destinationPointId,
        'destinationNumber': destinationNumber,
        'destinationName': destinationName,
        'destinationLatitude': destinationLatitude,
        'destinationLongitude': destinationLongitude,
        'startLatitude': startLatitude,
        'startLongitude': startLongitude,
        'stops': stops.map((s) => s.toJson()).toList(growable: false),
      };
}

class KakaoInAppNavStop {
  const KakaoInAppNavStop({
    required this.deliveryNumber,
    required this.pointId,
    required this.name,
    required this.product,
    required this.quantity,
    required this.address,
    required this.detailAddress,
    required this.customerName,
    required this.latitude,
    required this.longitude,
    required this.statusCode,
    required this.isCompleted,
  });

  final int deliveryNumber;
  final String pointId;
  final String name;
  final String product;
  final int quantity;
  final String address;
  final String detailAddress;
  final String customerName;
  final double latitude;
  final double longitude;
  final String statusCode;
  final bool isCompleted;

  Map<String, Object?> toJson() => {
        'deliveryNumber': deliveryNumber,
        'pointId': pointId,
        'name': name,
        'product': product,
        'quantity': quantity,
        'address': address,
        'detailAddress': detailAddress,
        'customerName': customerName,
        'latitude': latitude,
        'longitude': longitude,
        'statusCode': statusCode,
        'isCompleted': isCompleted,
      };
}
