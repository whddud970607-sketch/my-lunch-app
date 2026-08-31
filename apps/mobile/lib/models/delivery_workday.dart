import 'delivery_session.dart';

/// Non-sensitive Workday lifecycle projection from Nest.
/// Never includes PII, access secrets, or raw route points.
class DeliveryWorkdayMembership {
  const DeliveryWorkdayMembership({
    required this.jobId,
    required this.attachedAt,
    this.detachedAt,
    required this.membershipSource,
    required this.active,
  });

  final String jobId;
  final DateTime attachedAt;
  final DateTime? detachedAt;
  final String membershipSource;
  final bool active;

  factory DeliveryWorkdayMembership.fromJson(Map<String, dynamic> json) {
    return DeliveryWorkdayMembership(
      jobId: json['jobId'] as String? ?? '',
      attachedAt: DateTime.parse(json['attachedAt'] as String),
      detachedAt: json['detachedAt'] != null
          ? DateTime.parse(json['detachedAt'] as String)
          : null,
      membershipSource: json['membershipSource'] as String? ?? '',
      active: json['active'] as bool? ?? (json['detachedAt'] == null),
    );
  }
}

class DeliveryWorkday {
  const DeliveryWorkday({
    required this.id,
    required this.driverId,
    required this.serviceDate,
    required this.status,
    required this.startedAt,
    this.endedAt,
    this.startIdempotencyKey,
    this.summarySnapshot = const {},
    this.membership = const [],
    this.incompletePoints,
    this.openSessionIds,
    this.executionSessionId,
    this.progress,
  });

  final String id;
  final String driverId;
  final String serviceDate;
  final String status;
  final DateTime startedAt;

  /// Server sets this when Workday enters `ending` (user confirmed end).
  /// Not the finalize-completion timestamp.
  final DateTime? endedAt;
  final String? startIdempotencyKey;
  final Map<String, dynamic> summarySnapshot;
  final List<DeliveryWorkdayMembership> membership;
  final int? incompletePoints;
  final List<String>? openSessionIds;
  /// B3: existing execution Session for this Workday (internal orchestration).
  final String? executionSessionId;
  final DeliveryProgressCounts? progress;

  bool get isOpen => status == 'active' || status == 'ending';
  bool get isActive => status == 'active';
  bool get isEnding => status == 'ending';
  bool get isCompleted => status == 'completed';

  List<String> get activeJobIds => membership
      .where((m) => m.active && m.jobId.isNotEmpty)
      .map((m) => m.jobId)
      .toList(growable: false);

  factory DeliveryWorkday.fromJson(Map<String, dynamic> json) {
    final membershipRaw = json['membership'];
    final membership = membershipRaw is List
        ? membershipRaw
            .whereType<Map>()
            .map((e) => DeliveryWorkdayMembership.fromJson(
                  Map<String, dynamic>.from(e),
                ))
            .toList(growable: false)
        : const <DeliveryWorkdayMembership>[];

    final openRaw = json['openSessionIds'];
    final openSessionIds = openRaw is List
        ? openRaw.map((e) => e.toString()).toList(growable: false)
        : null;

    final progressRaw = json['progress'];
    final progress = progressRaw is Map<String, dynamic>
        ? DeliveryProgressCounts.fromJson(progressRaw)
        : null;

    final snap = json['summarySnapshot'];
    return DeliveryWorkday(
      id: json['id'] as String,
      driverId: json['driverId'] as String? ?? '',
      serviceDate: json['serviceDate'] as String? ?? '',
      status: json['status'] as String? ?? '',
      startedAt: DateTime.parse(json['startedAt'] as String),
      endedAt: json['endedAt'] != null
          ? DateTime.parse(json['endedAt'] as String)
          : null,
      startIdempotencyKey: json['startIdempotencyKey'] as String?,
      summarySnapshot: snap is Map
          ? Map<String, dynamic>.from(snap)
          : const <String, dynamic>{},
      membership: membership,
      incompletePoints: (json['incompletePoints'] as num?)?.toInt(),
      openSessionIds: openSessionIds,
      executionSessionId: json['executionSessionId'] as String?,
      progress: progress,
    );
  }
}

class WorkdayStartResult {
  const WorkdayStartResult({
    required this.workday,
    required this.created,
  });

  final DeliveryWorkday workday;
  final bool created;
}

class WorkdayReconcileResult {
  const WorkdayReconcileResult({
    required this.workday,
    required this.attached,
    required this.detached,
  });

  final DeliveryWorkday workday;
  final int attached;
  final int detached;
}

class WorkdayRequestEndResult {
  const WorkdayRequestEndResult({
    required this.workday,
    this.alreadyEnded = false,
    this.alreadyEnding = false,
    this.requiresClientSessionEnd = false,
  });

  final DeliveryWorkday workday;
  final bool alreadyEnded;
  final bool alreadyEnding;
  final bool requiresClientSessionEnd;
}
