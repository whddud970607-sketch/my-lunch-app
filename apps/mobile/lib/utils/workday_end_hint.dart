import '../models/delivery_workday.dart';

/// Resolves incomplete-point hints for end confirmation UX.
///
/// B3 Workday path must not treat Today remainingPoints as Workday obligation.
class WorkdayEndHint {
  WorkdayEndHint._();

  /// Active B3 Workday lifecycle (flag ON + open Workday).
  static bool isB3WorkdayPath({
    required bool b3ExecutionEnabled,
    required DeliveryWorkday? workday,
  }) {
    return b3ExecutionEnabled && workday != null && workday.isOpen;
  }

  /// Returns incomplete count when known.
  ///
  /// B3: Workday-only (null when obligation count unavailable — never Today).
  /// B2/legacy: Workday incompletePoints, else Today remaining, else 0.
  static int? resolveIncompleteHint({
    required bool b3ExecutionEnabled,
    required DeliveryWorkday? workday,
    required int? todayRemainingPoints,
  }) {
    if (isB3WorkdayPath(
      b3ExecutionEnabled: b3ExecutionEnabled,
      workday: workday,
    )) {
      if (workday!.incompletePoints != null) {
        return workday.incompletePoints;
      }
      return workday.progress?.incompletePoints;
    }

    return workday?.incompletePoints ?? todayRemainingPoints ?? 0;
  }
}
