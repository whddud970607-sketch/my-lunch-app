class MapSpikePoint {
  const MapSpikePoint({
    required this.provider,
    required this.pinAccuracy,
    required this.latitude,
    required this.longitude,
    required this.carrier,
    required this.customerName,
    required this.address,
    required this.detailAddress,
    required this.product,
    required this.quantity,
    required this.status,
    required this.statusCode,
    required this.pointId,
    required this.jobId,
    required this.driverId,
    required this.piiMasked,
  });

  final String provider;
  final String pinAccuracy;
  final double latitude;
  final double longitude;
  final String carrier;
  final String customerName;
  final String address;
  final String detailAddress;
  final String product;
  final int quantity;
  final String status;
  final String statusCode;
  final String pointId;
  final String jobId;
  final String driverId;
  final bool piiMasked;

  bool get isCompleted => statusCode == 'completed';

  MapSpikePoint copyWith({
    double? latitude,
    double? longitude,
    String? pinAccuracy,
    String? status,
    String? statusCode,
    String? product,
    String? customerName,
    String? address,
    String? detailAddress,
    bool? piiMasked,
  }) {
    return MapSpikePoint(
      provider: provider,
      pinAccuracy: pinAccuracy ?? this.pinAccuracy,
      latitude: latitude ?? this.latitude,
      longitude: longitude ?? this.longitude,
      carrier: carrier,
      customerName: customerName ?? this.customerName,
      address: address ?? this.address,
      detailAddress: detailAddress ?? this.detailAddress,
      product: product ?? this.product,
      quantity: quantity,
      status: status ?? this.status,
      statusCode: statusCode ?? this.statusCode,
      pointId: pointId,
      jobId: jobId,
      driverId: driverId,
      piiMasked: piiMasked ?? this.piiMasked,
    );
  }

  factory MapSpikePoint.fromJson(Map<String, dynamic> json) {
    return MapSpikePoint(
      provider: json['provider'] as String? ?? 'kakao',
      pinAccuracy: json['pinAccuracy'] as String? ?? 'address',
      latitude: (json['latitude'] as num).toDouble(),
      longitude: (json['longitude'] as num).toDouble(),
      carrier: json['carrier'] as String? ?? '',
      customerName: json['customerName'] as String? ?? '',
      address: json['address'] as String? ?? '',
      detailAddress: json['detailAddress'] as String? ?? '',
      product: json['product'] as String? ?? '',
      quantity: (json['quantity'] as num?)?.toInt() ?? 1,
      status: json['status'] as String? ?? '',
      statusCode: json['statusCode'] as String? ?? 'pending',
      pointId: json['pointId'] as String? ?? '',
      jobId: json['jobId'] as String? ?? '',
      driverId: json['driverId'] as String? ?? '',
      piiMasked: json['piiMasked'] as bool? ?? false,
    );
  }
}
