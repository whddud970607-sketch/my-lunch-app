import '../models/today_workset.dart';
import '../state/delivery_session_controller.dart';

class NamedVolumeRow {
  const NamedVolumeRow({required this.label, required this.totalPoints});

  final String label;
  final int totalPoints;
}

class WorkdayBadgeView {
  const WorkdayBadgeView({required this.label, required this.tone});

  final String label;
  final WorkdayBadgeTone tone;
}

enum WorkdayBadgeTone { idle, active, success, warning }

/// Company volumes using display names only — never raw IDs.
List<NamedVolumeRow> namedCompanyVolumes(TodayWorkset workset) {
  final rows = <NamedVolumeRow>[];
  for (final row in workset.summary.byCompany) {
    if (row.totalPoints <= 0) continue;
    if (row.companyId == null) {
      rows.add(NamedVolumeRow(label: '직접추가', totalPoints: row.totalPoints));
      continue;
    }
    final name = (workset.companyById(row.companyId)?.displayName ?? '').trim();
    if (name.isEmpty) continue;
    rows.add(NamedVolumeRow(label: name, totalPoints: row.totalPoints));
  }
  return rows;
}

/// Source volumes using display names only — never raw IDs.
List<NamedVolumeRow> namedSourceVolumes(TodayWorkset workset) {
  final rows = <NamedVolumeRow>[];
  for (final row in workset.summary.bySource) {
    if (row.totalPoints <= 0 || row.sourceId == null) continue;
    final name = (workset.sourceById(row.sourceId)?.displayName ?? '').trim();
    if (name.isEmpty) continue;
    rows.add(NamedVolumeRow(label: name, totalPoints: row.totalPoints));
  }
  return rows;
}

WorksetPoint? firstIncompletePoint(TodayWorkset? workset) {
  if (workset == null) return null;
  for (final point in workset.points) {
    if (!point.isCompleted) return point;
  }
  return null;
}

List<WorksetPoint> completedPointsLimited(TodayWorkset? workset, {int max = 3}) {
  if (workset == null) return const [];
  return workset.points.where((p) => p.isCompleted).take(max).toList();
}

int workdayProgressPercent({required int total, required int completed}) {
  if (total <= 0) return 0;
  final raw = ((completed / total) * 100).round();
  if (raw < 0) return 0;
  if (raw > 100) return 100;
  return raw;
}

String pointCardTitle(WorksetPoint point) {
  final label = point.displayLabel.trim();
  if (label.isEmpty) return '배송지';
  return label;
}

String formatHomeServiceDate(String? serviceDate, DateTime now) {
  final parsed = parseServiceDate(serviceDate);
  final d = parsed ?? now;
  return '${d.year}년 ${d.month}월 ${d.day}일';
}

DateTime? parseServiceDate(String? raw) {
  if (raw == null) return null;
  final t = raw.trim();
  if (t.isEmpty) return null;
  final m = RegExp(r'^(\d{4})-(\d{2})-(\d{2})').firstMatch(t);
  if (m == null) return null;
  return DateTime(
    int.parse(m[1]!),
    int.parse(m[2]!),
    int.parse(m[3]!),
  );
}

String formatElapsed(int seconds) {
  final h = seconds ~/ 3600;
  final m = (seconds % 3600) ~/ 60;
  final s = seconds % 60;
  if (h > 0) {
    return '${h.toString().padLeft(2, '0')}:'
        '${m.toString().padLeft(2, '0')}:'
        '${s.toString().padLeft(2, '0')}';
  }
  return '${m.toString().padLeft(2, '0')}:${s.toString().padLeft(2, '0')}';
}

WorkdayBadgeView workdayBadgeView({
  required DeliveryLifecyclePhase phase,
  required bool needsRecovery,
}) {
  if (needsRecovery ||
      phase == DeliveryLifecyclePhase.ending ||
      phase == DeliveryLifecyclePhase.endRetryable) {
    return const WorkdayBadgeView(
      label: '배송 종료',
      tone: WorkdayBadgeTone.warning,
    );
  }
  switch (phase) {
    case DeliveryLifecyclePhase.idle:
      return const WorkdayBadgeView(
        label: '배송 전',
        tone: WorkdayBadgeTone.idle,
      );
    case DeliveryLifecyclePhase.completed:
      return const WorkdayBadgeView(
        label: '배송 종료',
        tone: WorkdayBadgeTone.success,
      );
    case DeliveryLifecyclePhase.starting:
    case DeliveryLifecyclePhase.active:
    case DeliveryLifecyclePhase.activeNoSession:
      return const WorkdayBadgeView(
        label: '배송 중',
        tone: WorkdayBadgeTone.active,
      );
    case DeliveryLifecyclePhase.ending:
    case DeliveryLifecyclePhase.endRetryable:
      return const WorkdayBadgeView(
        label: '배송 종료',
        tone: WorkdayBadgeTone.warning,
      );
  }
}
