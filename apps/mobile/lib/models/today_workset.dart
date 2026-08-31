import 'delivery_shipment.dart';
import 'shipment_namespace_key.dart';

/// GET /v1/delivery/today projection — no PII / access secrets / GPS history.
class TodayWorkset {
  const TodayWorkset({
    required this.serviceDate,
    required this.summary,
    required this.companies,
    required this.sources,
    required this.jobs,
    required this.points,
    required this.shipments,
  });

  final String serviceDate;
  final WorksetSummary summary;
  final List<WorksetCompany> companies;
  final List<WorksetSource> sources;
  final List<WorksetJob> jobs;
  final List<WorksetPoint> points;
  final List<WorksetShipment> shipments;

  bool get isEmpty => points.isEmpty;

  WorksetSource? sourceById(String? id) {
    if (id == null) return null;
    for (final s in sources) {
      if (s.id == id) return s;
    }
    return null;
  }

  WorksetCompany? companyById(String? id) {
    if (id == null) return null;
    for (final c in companies) {
      if (c.id == id) return c;
    }
    return null;
  }

  factory TodayWorkset.fromJson(Map<String, dynamic> json) {
    final companies = _listMaps(json['companies'])
        .map(WorksetCompany.fromJson)
        .toList(growable: false);
    final sources = _listMaps(json['sources'])
        .map(WorksetSource.fromJson)
        .toList(growable: false);
    final jobs = _listMaps(json['jobs'])
        .map(WorksetJob.fromJson)
        .toList(growable: false);
    final points = _listMaps(json['points'])
        .map(WorksetPoint.fromJson)
        .toList(growable: false);
    final shipments = _listMaps(json['shipments'])
        .map(WorksetShipment.fromJson)
        .toList(growable: false);
    final summaryRaw = json['summary'];
    final summary = summaryRaw is Map
        ? WorksetSummary.fromJson(Map<String, dynamic>.from(summaryRaw))
        : WorksetSummary.empty;
    return TodayWorkset(
      serviceDate: json['serviceDate'] as String? ?? '',
      summary: summary,
      companies: companies,
      sources: sources,
      jobs: jobs,
      points: points,
      shipments: shipments,
    );
  }

  static List<Map<String, dynamic>> _listMaps(Object? raw) {
    if (raw is! List) return const [];
    return raw
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList(growable: false);
  }
}

class WorksetSummary {
  const WorksetSummary({
    required this.totalPoints,
    required this.completedPoints,
    required this.pendingPoints,
    required this.totalShipments,
    required this.byCompany,
    required this.bySource,
  });

  static const empty = WorksetSummary(
    totalPoints: 0,
    completedPoints: 0,
    pendingPoints: 0,
    totalShipments: 0,
    byCompany: [],
    bySource: [],
  );

  final int totalPoints;
  final int completedPoints;
  final int pendingPoints;
  final int totalShipments;
  final List<WorksetCompanySummary> byCompany;
  final List<WorksetSourceSummary> bySource;

  int get remainingPoints =>
      (totalPoints - completedPoints).clamp(0, 1 << 30);

  factory WorksetSummary.fromJson(Map<String, dynamic> json) {
    return WorksetSummary(
      totalPoints: (json['totalPoints'] as num?)?.toInt() ?? 0,
      completedPoints: (json['completedPoints'] as num?)?.toInt() ?? 0,
      pendingPoints: (json['pendingPoints'] as num?)?.toInt() ?? 0,
      totalShipments: (json['totalShipments'] as num?)?.toInt() ?? 0,
      byCompany: TodayWorkset._listMaps(json['byCompany'])
          .map(WorksetCompanySummary.fromJson)
          .toList(growable: false),
      bySource: TodayWorkset._listMaps(json['bySource'])
          .map(WorksetSourceSummary.fromJson)
          .toList(growable: false),
    );
  }
}

class WorksetCompanySummary {
  const WorksetCompanySummary({
    required this.companyId,
    required this.totalPoints,
    required this.completedPoints,
  });

  final String? companyId;
  final int totalPoints;
  final int completedPoints;

  factory WorksetCompanySummary.fromJson(Map<String, dynamic> json) {
    return WorksetCompanySummary(
      companyId: json['companyId'] as String?,
      totalPoints: (json['totalPoints'] as num?)?.toInt() ?? 0,
      completedPoints: (json['completedPoints'] as num?)?.toInt() ?? 0,
    );
  }
}

/// Workset-scoped company label (identity = [id]).
class WorksetCompany {
  const WorksetCompany({
    required this.id,
    required this.displayName,
  });

  final String id;
  final String displayName;

  factory WorksetCompany.fromJson(Map<String, dynamic> json) {
    return WorksetCompany(
      id: json['id'] as String? ?? '',
      displayName: json['displayName'] as String? ?? '',
    );
  }
}

class WorksetSourceSummary {
  const WorksetSourceSummary({
    required this.sourceId,
    required this.totalPoints,
    required this.completedPoints,
  });

  final String? sourceId;
  final int totalPoints;
  final int completedPoints;

  factory WorksetSourceSummary.fromJson(Map<String, dynamic> json) {
    return WorksetSourceSummary(
      sourceId: json['sourceId'] as String?,
      totalPoints: (json['totalPoints'] as num?)?.toInt() ?? 0,
      completedPoints: (json['completedPoints'] as num?)?.toInt() ?? 0,
    );
  }
}

class WorksetSource {
  const WorksetSource({
    required this.id,
    required this.companyId,
    required this.ownerDriverId,
    required this.sourceType,
    required this.sourceKey,
    required this.displayName,
    required this.externalSystem,
    required this.isActive,
  });

  final String id;
  final String? companyId;
  final String? ownerDriverId;
  final String sourceType;
  final String sourceKey;
  final String displayName;
  final String? externalSystem;
  final bool isActive;

  bool get isManual => sourceType == 'driver_manual';

  factory WorksetSource.fromJson(Map<String, dynamic> json) {
    return WorksetSource(
      id: json['id'] as String? ?? '',
      companyId: json['companyId'] as String?,
      ownerDriverId: json['ownerDriverId'] as String?,
      sourceType: json['sourceType'] as String? ?? '',
      sourceKey: json['sourceKey'] as String? ?? '',
      displayName: json['displayName'] as String? ?? '',
      externalSystem: json['externalSystem'] as String?,
      isActive: json['isActive'] as bool? ?? true,
    );
  }
}

class WorksetJob {
  const WorksetJob({
    required this.id,
    required this.companyId,
    required this.sourceId,
    required this.status,
    required this.serviceDate,
  });

  final String id;
  final String? companyId;
  final String? sourceId;
  final String status;
  final String serviceDate;

  factory WorksetJob.fromJson(Map<String, dynamic> json) {
    return WorksetJob(
      id: json['id'] as String? ?? '',
      companyId: json['companyId'] as String?,
      sourceId: json['sourceId'] as String?,
      status: json['status'] as String? ?? '',
      serviceDate: json['serviceDate'] as String? ?? '',
    );
  }
}

class WorksetPoint {
  const WorksetPoint({
    required this.pointId,
    required this.jobId,
    required this.companyId,
    required this.sourceId,
    required this.status,
    required this.latitude,
    required this.longitude,
    required this.quantity,
    required this.displayLabel,
    required this.pinAccuracy,
    required this.piiMasked,
    required this.hasAccessInfo,
    required this.shipmentCount,
    required this.contactAvailable,
  });

  final String pointId;
  final String jobId;
  final String? companyId;
  final String? sourceId;
  final String status;
  final double? latitude;
  final double? longitude;
  final int quantity;
  final String displayLabel;
  final String pinAccuracy;
  final bool piiMasked;
  final bool hasAccessInfo;
  final int shipmentCount;
  final bool contactAvailable;

  bool get hasCoordinates =>
      latitude != null &&
      longitude != null &&
      latitude != 0 &&
      longitude != 0;

  bool get isCompleted => status == 'completed';

  factory WorksetPoint.fromJson(Map<String, dynamic> json) {
    return WorksetPoint(
      pointId: json['pointId'] as String? ?? '',
      jobId: json['jobId'] as String? ?? '',
      companyId: json['companyId'] as String?,
      sourceId: json['sourceId'] as String?,
      status: json['status'] as String? ?? 'pending',
      latitude: (json['latitude'] as num?)?.toDouble(),
      longitude: (json['longitude'] as num?)?.toDouble(),
      quantity: (json['quantity'] as num?)?.toInt() ?? 1,
      displayLabel: json['displayLabel'] as String? ?? '',
      pinAccuracy: json['pinAccuracy'] as String? ?? 'address',
      piiMasked: json['piiMasked'] as bool? ?? false,
      hasAccessInfo: json['hasAccessInfo'] as bool? ?? false,
      shipmentCount: (json['shipmentCount'] as num?)?.toInt() ?? 0,
      contactAvailable: json['contactAvailable'] as bool? ?? false,
    );
  }
}

class WorksetShipment {
  const WorksetShipment({
    required this.id,
    required this.pointId,
    required this.jobId,
    required this.sourceId,
    required this.externalId,
    required this.sequenceNo,
    required this.trackingCode,
    required this.status,
  });

  final String id;
  final String pointId;
  final String jobId;
  final String? sourceId;
  final String? externalId;
  final int sequenceNo;
  final String trackingCode;
  final String status;

  ShipmentNamespaceKey get namespaceKey => ShipmentNamespaceKey(
        sourceId: sourceId,
        trackingCode: trackingCode,
      );

  DeliveryShipment toDeliveryShipment() {
    return DeliveryShipment(
      shipmentId: id,
      sequenceNo: sequenceNo,
      trackingCode: trackingCode,
      status: status,
      statusCode: status,
      sourceId: sourceId,
      externalId: externalId,
    );
  }

  factory WorksetShipment.fromJson(Map<String, dynamic> json) {
    return WorksetShipment(
      id: json['id'] as String? ?? '',
      pointId: json['pointId'] as String? ?? '',
      jobId: json['jobId'] as String? ?? '',
      sourceId: json['sourceId'] as String?,
      externalId: json['externalId'] as String?,
      sequenceNo: (json['sequenceNo'] as num?)?.toInt() ?? 0,
      trackingCode: json['trackingCode'] as String? ?? '',
      status: json['status'] as String? ?? 'pending',
    );
  }
}
