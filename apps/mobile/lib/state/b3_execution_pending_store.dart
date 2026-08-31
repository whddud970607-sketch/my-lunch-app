import 'package:shared_preferences/shared_preferences.dart';

/// Durable marker: B3 execution ensure was requested but may not have completed.
///
/// Survives process death between Workday start and execution Session ensure.
/// Cleared on ensure success, sign-out, or Workday end.
class B3ExecutionPendingStore {
  B3ExecutionPendingStore._();

  static const _key = 'b3.execution_pending_workday_id';

  static Future<void> mark(String workdayId) async {
    if (workdayId.isEmpty) return;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, workdayId);
  }

  static Future<bool> isPending(String workdayId) async {
    if (workdayId.isEmpty) return false;
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_key) == workdayId;
  }

  static Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_key);
  }
}
