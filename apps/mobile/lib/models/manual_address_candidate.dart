class ManualAddressCandidate {
  const ManualAddressCandidate({
    this.roadAddress,
    this.jibunAddress,
    this.buildingName,
    this.latitude,
    this.longitude,
  });

  final String? roadAddress;
  final String? jibunAddress;
  final String? buildingName;
  final double? latitude;
  final double? longitude;

  String get primaryLine {
    final road = roadAddress?.trim() ?? '';
    if (road.isNotEmpty) return road;
    return jibunAddress?.trim() ?? '';
  }

  factory ManualAddressCandidate.fromJson(Map<String, dynamic> json) {
    return ManualAddressCandidate(
      roadAddress: _str(json['roadAddress']),
      jibunAddress: _str(json['jibunAddress']),
      buildingName: _str(json['buildingName']),
      latitude: _num(json['latitude']),
      longitude: _num(json['longitude']),
    );
  }

  static String? _str(Object? raw) {
    if (raw is! String) return null;
    final t = raw.trim();
    return t.isEmpty ? null : t;
  }

  static double? _num(Object? raw) {
    if (raw is num) return raw.toDouble();
    return null;
  }
}

class ManualRegisterResult {
  const ManualRegisterResult({
    required this.ok,
    required this.resultCode,
    this.pointId,
    this.jobId,
    this.registrationMethod,
    this.manualReason,
    this.evidenceStatus,
    this.exactDongResolved,
    this.requiresPinConfirmation,
    this.coordinateSource,
  });

  final bool ok;
  final String resultCode;
  final String? pointId;
  final String? jobId;
  final String? registrationMethod;
  final String? manualReason;
  final String? evidenceStatus;
  final bool? exactDongResolved;
  final bool? requiresPinConfirmation;
  final String? coordinateSource;

  factory ManualRegisterResult.fromJson(Map<String, dynamic> json) {
    return ManualRegisterResult(
      ok: json['ok'] == true,
      resultCode: json['resultCode'] as String? ?? '',
      pointId: json['pointId'] as String?,
      jobId: json['jobId'] as String?,
      registrationMethod: json['registrationMethod'] as String?,
      manualReason: json['manualReason'] as String?,
      evidenceStatus: json['evidenceStatus'] as String?,
      exactDongResolved: json['exactDongResolved'] as bool?,
      requiresPinConfirmation: json['requiresPinConfirmation'] as bool?,
      coordinateSource: json['coordinateSource'] as String?,
    );
  }
}

class ManualCoordinateResolveResult {
  const ManualCoordinateResolveResult({
    required this.exactDongFound,
    required this.requiresPinConfirmation,
    this.requestedDong,
    this.latitude,
    this.longitude,
    this.sourceType,
    this.matchType,
  });

  final bool exactDongFound;
  final bool requiresPinConfirmation;
  final String? requestedDong;
  final double? latitude;
  final double? longitude;
  final String? sourceType;
  final String? matchType;

  factory ManualCoordinateResolveResult.fromJson(Map<String, dynamic> json) {
    final selected = json['selected'];
    final map = selected is Map<String, dynamic> ? selected : null;
    return ManualCoordinateResolveResult(
      exactDongFound: json['exactDongFound'] == true,
      requiresPinConfirmation: json['requiresPinConfirmation'] == true,
      requestedDong: json['requestedDong'] as String?,
      latitude: _num(map?['latitude']),
      longitude: _num(map?['longitude']),
      sourceType: map?['sourceType'] as String?,
      matchType: map?['matchType'] as String?,
    );
  }

  static double? _num(Object? raw) {
    if (raw is num) return raw.toDouble();
    return null;
  }
}

class InvoiceEvidenceUploadResult {
  const InvoiceEvidenceUploadResult({
    required this.ok,
    this.evidenceStatus,
    this.evidenceType,
  });

  final bool ok;
  final String? evidenceStatus;
  final String? evidenceType;

  factory InvoiceEvidenceUploadResult.fromJson(Map<String, dynamic> json) {
    return InvoiceEvidenceUploadResult(
      ok: json['ok'] == true,
      evidenceStatus: json['evidenceStatus'] as String?,
      evidenceType: json['evidenceType'] as String?,
    );
  }
}
