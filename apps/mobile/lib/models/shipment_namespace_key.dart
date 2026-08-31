/// Authoritative tracking identity after P0-B1-1.5 namespace cutover.
///
/// Never use [trackingCode] alone as a Map key for shipments.
class ShipmentNamespaceKey {
  const ShipmentNamespaceKey({
    required this.sourceId,
    required this.trackingCode,
  });

  final String? sourceId;
  final String trackingCode;

  @override
  bool operator ==(Object other) {
    return other is ShipmentNamespaceKey &&
        other.sourceId == sourceId &&
        other.trackingCode == trackingCode;
  }

  @override
  int get hashCode => Object.hash(sourceId, trackingCode);

  @override
  String toString() => 'ShipmentNamespaceKey($sourceId,$trackingCode)';
}
