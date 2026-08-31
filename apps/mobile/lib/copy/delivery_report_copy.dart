import '../models/delivery_session.dart';

/// Single place for delivery report / end copy.
class DeliveryReportCopy {
  DeliveryReportCopy._();

  static String formatDuration(int? seconds) {
    if (seconds == null || seconds < 0) return '—';
    final h = seconds ~/ 3600;
    final m = (seconds % 3600) ~/ 60;
    if (h > 0) return '$h시간 $m분';
    return '$m분';
  }

  static String headline(DeliveryProgressCounts progress) {
    if (progress.incompletePoints <= 0) {
      return '오늘의 배송을 완료했습니다!';
    }
    return '오늘 배송 업무를 종료했습니다.';
  }

  static String body({
    required DeliveryProgressCounts progress,
    required int? durationSeconds,
  }) {
    final duration = formatDuration(durationSeconds);
    if (progress.incompletePoints <= 0) {
      return '오늘 배송하신 경로는 위 지도와 같습니다.\n'
          '오늘 총 배송시간은 $duration입니다.\n\n'
          '오늘 정말 수고 많으셨습니다.\n안전하게 귀가하세요!';
    }
    return '오늘 ${progress.totalPoints}건 중 ${progress.completedPoints}건의 배송을 완료했습니다.\n'
        '미완료 ${progress.incompletePoints}건이 남아 있습니다.\n'
        '오늘 총 배송시간은 $duration입니다.\n\n'
        '오늘도 수고 많으셨습니다. 안전하게 귀가하세요!';
  }

  static String incompleteEndWarning(int incompleteCount) {
    return '아직 완료되지 않은 배송이 있습니다.\n\n'
        '미완료 배송 $incompleteCount건\n\n'
        '그래도 오늘 배송을 종료하시겠습니까?';
  }

  /// B3 safe fallback when Workday obligation count is unavailable.
  static String incompleteEndWarningGeneric() {
    return '아직 완료되지 않은 배송이 있을 수 있습니다.\n\n'
        '그래도 오늘 배송을 종료하시겠습니까?';
  }
}
