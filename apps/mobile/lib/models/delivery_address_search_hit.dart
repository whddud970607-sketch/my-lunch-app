class DeliveryAddressSearchHit {
  const DeliveryAddressSearchHit({
    required this.pointId,
    required this.displayLabel,
    required this.status,
    required this.addressSnippet,
  });

  final String pointId;
  final String displayLabel;
  final String status;
  final String addressSnippet;

  factory DeliveryAddressSearchHit.fromJson(Map<String, dynamic> json) {
    return DeliveryAddressSearchHit(
      pointId: json['pointId'] as String? ?? '',
      displayLabel: json['displayLabel'] as String? ?? '',
      status: json['status'] as String? ?? '',
      addressSnippet: json['addressSnippet'] as String? ?? '',
    );
  }
}
