class DriverInfo {
  const DriverInfo({
    required this.id,
    required this.companyId,
    required this.workStatus,
  });

  final String id;
  final String? companyId;
  final String workStatus;

  factory DriverInfo.fromJson(Map<String, dynamic> json) {
    return DriverInfo(
      id: json['id'] as String,
      companyId: json['companyId'] as String?,
      workStatus: (json['workStatus'] as String?) ?? 'unknown',
    );
  }
}

class MeResponse {
  const MeResponse({
    required this.userId,
    required this.email,
    required this.role,
    required this.companyId,
    required this.displayName,
    required this.driver,
  });

  final String userId;
  final String? email;
  final String role;
  final String? companyId;
  final String? displayName;
  final DriverInfo? driver;

  bool get isDriver => role == 'driver';

  factory MeResponse.fromJson(Map<String, dynamic> json) {
    final driverRaw = json['driver'];
    return MeResponse(
      userId: json['userId'] as String,
      email: json['email'] as String?,
      role: json['role'] as String,
      companyId: json['companyId'] as String?,
      displayName: json['displayName'] as String?,
      driver: driverRaw is Map<String, dynamic>
          ? DriverInfo.fromJson(driverRaw)
          : null,
    );
  }
}
