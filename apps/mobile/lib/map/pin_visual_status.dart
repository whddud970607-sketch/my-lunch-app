/// Map pin visual status — independent of map SDK.
///
/// Extensible for future failed / retry colors without changing callers much.
enum PinVisualStatus {
  /// Pending / in-progress — red (default).
  open,

  /// Fully completed at this location — gray / low chroma.
  completed,

  /// Reserved: failed stop (future).
  failed,

  /// Reserved: retry needed (future).
  retry,
}

extension PinVisualStatusX on PinVisualStatus {
  String get styleKey {
    switch (this) {
      case PinVisualStatus.open:
        return 'open';
      case PinVisualStatus.completed:
        return 'done';
      case PinVisualStatus.failed:
        return 'fail';
      case PinVisualStatus.retry:
        return 'retry';
    }
  }
}

/// Derive pin color from member point status codes at one location.
PinVisualStatus pinVisualStatusForStatusCodes(Iterable<String> statusCodes) {
  final list = statusCodes.toList(growable: false);
  if (list.isEmpty) return PinVisualStatus.open;
  final allDone = list.every((s) => s == 'completed');
  if (allDone) return PinVisualStatus.completed;
  final anyFailed = list.any((s) => s == 'failed');
  if (anyFailed) return PinVisualStatus.failed;
  return PinVisualStatus.open;
}
