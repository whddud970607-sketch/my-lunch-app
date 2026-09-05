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
  });

  final bool ok;
  final String resultCode;
  final String? pointId;
  final String? jobId;
  final String? registrationMethod;
  final String? manualReason;
  final String? evidenceStatus;

  factory ManualRegisterResult.fromJson(Map<String, dynamic> json) {
    return ManualRegisterResult(
      ok: json['ok'] == true,
      resultCode: json['resultCode'] as String? ?? '',
      pointId: json['pointId'] as String?,
      jobId: json['jobId'] as String?,
      registrationMethod: json['registrationMethod'] as String?,
      manualReason: json['manualReason'] as String?,
      evidenceStatus: json['evidenceStatus'] as String?,
    );
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
