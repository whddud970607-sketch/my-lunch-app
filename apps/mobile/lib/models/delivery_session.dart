import '../location/driver_location_snapshot.dart';

/// Provider-independent recorded route geometry.
class DeliveryRoutePoint {
  const DeliveryRoutePoint({
    required this.sequenceNo,
    required this.recordedAt,
    required this.latitude,
    required this.longitude,
    this.accuracyM,
    this.speedMps,
    this.headingDeg,
    this.source = 'gps',
  });

  final int sequenceNo;
  final DateTime recordedAt;
  final double latitude;
  final double longitude;
  final double? accuracyM;
  final double? speedMps;
  final double? headingDeg;
  final String source;

  factory DeliveryRoutePoint.fromSnapshot({
    required int sequenceNo,
    required DriverLocationSnapshot snapshot,
  }) {
    return DeliveryRoutePoint(
      sequenceNo: sequenceNo,
      recordedAt: snapshot.timestamp.toUtc(),
      latitude: snapshot.latitude,
      longitude: snapshot.longitude,
      accuracyM: snapshot.accuracyMeters,
      speedMps: snapshot.speedMetersPerSecond,
      headingDeg: snapshot.headingDegrees,
    );
  }

  Map<String, dynamic> toJson() => {
        'sequenceNo': sequenceNo,
        'recordedAt': recordedAt.toUtc().toIso8601String(),
        'latitude': latitude,
        'longitude': longitude,
        'accuracyM': accuracyM,
        'speedMps': speedMps,
        'headingDeg': headingDeg,
        'source': source,
      };

  factory DeliveryRoutePoint.fromJson(Map<String, dynamic> json) {
    return DeliveryRoutePoint(
      sequenceNo: (json['sequenceNo'] as num).toInt(),
      recordedAt: DateTime.parse(json['recordedAt'] as String),
      latitude: (json['latitude'] as num).toDouble(),
      longitude: (json['longitude'] as num).toDouble(),
      accuracyM: (json['accuracyM'] as num?)?.toDouble(),
      speedMps: (json['speedMps'] as num?)?.toDouble(),
      headingDeg: (json['headingDeg'] as num?)?.toDouble(),
      source: json['source'] as String? ?? 'gps',
    );
  }
}

class DeliveryRoute {
  const DeliveryRoute({
    required this.sessionId,
    required this.points,
  });

  final String sessionId;
  final List<DeliveryRoutePoint> points;

  DeliveryRoutePoint? get start => points.isEmpty ? null : points.first;
  DeliveryRoutePoint? get end => points.isEmpty ? null : points.last;
}

class DeliveryProgressCounts {
  const DeliveryProgressCounts({
    required this.totalPoints,
    required this.completedPoints,
    required this.incompletePoints,
    this.failedPoints = 0,
    this.totalQuantity = 0,
  });

  final int totalPoints;
  final int completedPoints;
  final int incompletePoints;
  final int failedPoints;
  final int totalQuantity;

  factory DeliveryProgressCounts.fromJson(Map<String, dynamic>? json) {
    if (json == null) {
      return const DeliveryProgressCounts(
        totalPoints: 0,
        completedPoints: 0,
        incompletePoints: 0,
      );
    }
    return DeliveryProgressCounts(
      totalPoints: (json['totalPoints'] as num?)?.toInt() ?? 0,
      completedPoints: (json['completedPoints'] as num?)?.toInt() ?? 0,
      incompletePoints: (json['incompletePoints'] as num?)?.toInt() ?? 0,
      failedPoints: (json['failedPoints'] as num?)?.toInt() ?? 0,
      totalQuantity: (json['totalQuantity'] as num?)?.toInt() ?? 0,
    );
  }
}

class DeliverySession {
  const DeliverySession({
    required this.id,
    required this.driverId,
    this.deliveryJobId,
    required this.status,
    required this.startedAt,
    this.workdayId,
    this.sessionRole,
    this.endedAt,
    this.progress,
    this.durationSeconds,
    this.lastUploadedSequence,
    this.summarySnapshot,
  });

  final String id;
  final String driverId;
  /// Null for job-neutral execution sessions (B3).
  final String? deliveryJobId;
  /// Null for legacy sessions created before Workday link.
  final String? workdayId;
  /// `legacy_job` | `workday_job_slice` | `workday_execution`
  final String? sessionRole;
  final String status;
  final DateTime startedAt;
  final DateTime? endedAt;
  final DeliveryProgressCounts? progress;
  final int? durationSeconds;
  final int? lastUploadedSequence;
  final Map<String, dynamic>? summarySnapshot;

  bool get isOpen => status == 'active' || status == 'ending';
  bool get isActive => status == 'active';
  bool get isLegacy =>
      workdayId == null || workdayId!.isEmpty || sessionRole == 'legacy_job';
  bool get isExecutionSession => sessionRole == 'workday_execution';
  bool get isJobBoundSession =>
      sessionRole == 'workday_job_slice' ||
      sessionRole == 'legacy_job' ||
      (deliveryJobId != null && deliveryJobId!.isNotEmpty);

  factory DeliverySession.fromJson(Map<String, dynamic> json) {
    return DeliverySession(
      id: json['id'] as String,
      driverId: json['driverId'] as String,
      deliveryJobId: json['deliveryJobId'] as String?,
      workdayId: json['workdayId'] as String?,
      sessionRole: json['sessionRole'] as String?,
      status: json['status'] as String,
      startedAt: DateTime.parse(json['startedAt'] as String),
      endedAt: json['endedAt'] != null
          ? DateTime.parse(json['endedAt'] as String)
          : null,
      progress: DeliveryProgressCounts.fromJson(
        json['progress'] as Map<String, dynamic>?,
      ),
      durationSeconds: (json['durationSeconds'] as num?)?.toInt(),
      lastUploadedSequence: (json['lastUploadedSequence'] as num?)?.toInt(),
      summarySnapshot: json['summarySnapshot'] as Map<String, dynamic>?,
    );
  }
}
