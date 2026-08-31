/// Local sync operation lifecycle statuses (Phase 0/1).
enum OperationStatus {
  pending,
  ready,
  inFlight,
  acked,
  blocked,
  deadLetter,
  conflictNeedsAttention;

  static OperationStatus parse(String raw) {
    for (final v in OperationStatus.values) {
      if (v.name == raw) return v;
    }
    throw FormatException('unknown OperationStatus: $raw');
  }
}
