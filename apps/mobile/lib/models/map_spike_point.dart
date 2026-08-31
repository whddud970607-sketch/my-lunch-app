import 'delivery_shipment.dart';

class MapSpikePoint {
  const MapSpikePoint({
    required this.geocodeProvider,
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
    this.deliveryMemo,
    this.contactType = 'none',
    this.contactValue,
    this.hasAccessInfo = false,
    this.fixtureGroup = 'other',
    this.shipments = const [],
    this.companyId,
    this.sourceId,
    this.companyLabel,
    this.sourceLabel,
  });

  /// Address/geocode source (e.g. kakao keyword) — NOT the map SDK choice.
  final String geocodeProvider;
  final String pinAccuracy;
  final double latitude;
  final double longitude;
  final String carrier;
  final String customerName;
  final String address;
  final String detailAddress;
  final String? deliveryMemo;
  final String product;
  final int quantity;
  final String status;
  final String statusCode;
  final String pointId;
  final String jobId;
  final String driverId;
  final bool piiMasked;

  /// `none` | `masked_number` | `virtual_number` — never raw MSISDN store.
  final String contactType;

  /// Present only when allowed by Nest; null when none / masked / purged.
  final String? contactValue;

  /// True when Nest reports an access_secret row exists (ciphertext never here).
  final bool hasAccessInfo;

  /// `namdong10-sim` | `seoul-parc1-sim` | `spike` | `other`
  final String fixtureGroup;

  /// Package-level tracking codes (1:N under this point).
  final List<DeliveryShipment> shipments;

  /// Workset company/source identity (filter + detail context).
  final String? companyId;
  final String? sourceId;

  /// Optional soft-only labels; never invent "Unknown Company".
  final String? companyLabel;
  final String? sourceLabel;

  bool get isCompleted => statusCode == 'completed';

  bool get isNamdongCluster => fixtureGroup == 'namdong10-sim';

  bool get canContact =>
      !piiMasked &&
      !isCompleted &&
      contactType != 'none' &&
      (contactValue?.trim().isNotEmpty ?? false);

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
    String? deliveryMemo,
    bool? piiMasked,
    String? contactType,
    String? contactValue,
    bool? hasAccessInfo,
    String? fixtureGroup,
    List<DeliveryShipment>? shipments,
    String? companyId,
    String? sourceId,
    String? companyLabel,
    String? sourceLabel,
  }) {
    return MapSpikePoint(
      geocodeProvider: geocodeProvider,
      pinAccuracy: pinAccuracy ?? this.pinAccuracy,
      latitude: latitude ?? this.latitude,
      longitude: longitude ?? this.longitude,
      carrier: carrier,
      customerName: customerName ?? this.customerName,
      address: address ?? this.address,
      detailAddress: detailAddress ?? this.detailAddress,
      deliveryMemo: deliveryMemo ?? this.deliveryMemo,
      product: product ?? this.product,
      quantity: quantity,
      status: status ?? this.status,
      statusCode: statusCode ?? this.statusCode,
      pointId: pointId,
      jobId: jobId,
      driverId: driverId,
      piiMasked: piiMasked ?? this.piiMasked,
      contactType: contactType ?? this.contactType,
      contactValue: contactValue ?? this.contactValue,
      hasAccessInfo: hasAccessInfo ?? this.hasAccessInfo,
      fixtureGroup: fixtureGroup ?? this.fixtureGroup,
      shipments: shipments ?? this.shipments,
      companyId: companyId ?? this.companyId,
      sourceId: sourceId ?? this.sourceId,
      companyLabel: companyLabel ?? this.companyLabel,
      sourceLabel: sourceLabel ?? this.sourceLabel,
    );
  }

  factory MapSpikePoint.fromJson(Map<String, dynamic> json) {
    final rawShipments = json['shipments'];
    final shipments = rawShipments is List
        ? rawShipments
            .whereType<Map>()
            .map((e) => DeliveryShipment.fromJson(Map<String, dynamic>.from(e)))
            .toList(growable: false)
        : const <DeliveryShipment>[];
    return MapSpikePoint(
      geocodeProvider: (json['geocodeProvider'] as String?) ??
          (json['provider'] as String?) ??
          'kakao',
      pinAccuracy: json['pinAccuracy'] as String? ?? 'address',
      latitude: (json['latitude'] as num).toDouble(),
      longitude: (json['longitude'] as num).toDouble(),
      carrier: json['carrier'] as String? ?? '',
      customerName: json['customerName'] as String? ?? '',
      address: (json['rawAddress'] as String?) ??
          (json['address'] as String?) ??
          '',
      detailAddress: json['detailAddress'] as String? ?? '',
      deliveryMemo: json['deliveryMemo'] as String?,
      product: (json['displayLabel'] as String?) ??
          (json['product'] as String?) ??
          '',
      quantity: (json['totalQuantity'] as num?)?.toInt() ??
          (json['quantity'] as num?)?.toInt() ??
          1,
      status: json['status'] as String? ?? '',
      statusCode: json['statusCode'] as String? ?? 'pending',
      pointId: json['pointId'] as String? ?? '',
      jobId: json['jobId'] as String? ?? '',
      driverId: json['driverId'] as String? ?? '',
      piiMasked: json['piiMasked'] as bool? ?? false,
      contactType: json['contactType'] as String? ?? 'none',
      contactValue: json['contactValue'] as String?,
      hasAccessInfo: json['hasAccessInfo'] as bool? ?? false,
      fixtureGroup: json['fixtureGroup'] as String? ?? 'other',
      shipments: shipments,
      companyId: json['companyId'] as String?,
      sourceId: json['sourceId'] as String?,
      companyLabel: json['companyLabel'] as String?,
      sourceLabel: json['sourceLabel'] as String?,
    );
  }
}
