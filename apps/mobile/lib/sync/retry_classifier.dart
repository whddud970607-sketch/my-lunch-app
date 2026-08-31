import 'dart:math';

/// Classifies sync failures without performing HTTP (Phase 0/1).
enum RetryClass {
  /// Network / 5xx / 429 / timeout — keep queue; backoff; never deadLetter by count alone.
  transient,

  /// Wait for auth refresh / re-login; keep queue; do not dispatch.
  authWait,

  /// 403 / confirmed 404 / validation / idempotency mismatch — deadLetter candidate.
  permanent,

  /// Domain conflict — needs attention / policy.
  conflict,
}

class RetryDecision {
  const RetryDecision({
    required this.classification,
    required this.shouldRetry,
    required this.moveToDeadLetter,
    required this.pauseSync,
    this.nextDelay,
    this.errorCode,
  });

  final RetryClass classification;
  final bool shouldRetry;
  final bool moveToDeadLetter;
  final bool pauseSync;
  final Duration? nextDelay;
  final String? errorCode;
}

/// Shared retry taxonomy (also conceptually shared with Route sync — not wired).
class RetryClassifier {
  RetryClassifier({Random? random, this.maxBackoff = const Duration(minutes: 15)})
      : _random = random ?? Random();

  final Random _random;
  final Duration maxBackoff;

  /// Base delay grows as 2^retryCount seconds (capped), plus jitter.
  Duration backoffFor(int retryCount) {
    final exp = retryCount.clamp(0, 10);
    final seconds = (1 << exp).clamp(2, maxBackoff.inSeconds);
    final jitterMs = _random.nextInt(1000);
    final d = Duration(seconds: seconds, milliseconds: jitterMs);
    if (d > maxBackoff) return maxBackoff;
    return d;
  }

  RetryDecision classify({
    required String errorCode,
    int retryCount = 0,
  }) {
    final code = errorCode.trim().toLowerCase();

    if (_isAuth(code)) {
      return RetryDecision(
        classification: RetryClass.authWait,
        shouldRetry: false,
        moveToDeadLetter: false,
        pauseSync: true,
        errorCode: code,
      );
    }

    if (_isConflict(code)) {
      return RetryDecision(
        classification: RetryClass.conflict,
        shouldRetry: false,
        moveToDeadLetter: false,
        pauseSync: false,
        errorCode: code,
      );
    }

    if (_isPermanent(code)) {
      return RetryDecision(
        classification: RetryClass.permanent,
        shouldRetry: false,
        moveToDeadLetter: true,
        pauseSync: false,
        errorCode: code,
      );
    }

    // Transient: network, timeout, 429, 5xx, 503 — NEVER deadLetter solely by retry count.
    return RetryDecision(
      classification: RetryClass.transient,
      shouldRetry: true,
      moveToDeadLetter: false,
      pauseSync: false,
      nextDelay: backoffFor(retryCount),
      errorCode: code,
    );
  }

  bool _isAuth(String code) =>
      code == '401' ||
      code == 'unauthorized' ||
      code == 'auth_required' ||
      code.startsWith('auth_');

  bool _isConflict(String code) =>
      code == '409' ||
      code == 'conflict' ||
      code == 'state_conflict';

  bool _isPermanent(String code) {
    if (code == '403' || code == 'forbidden') return true;
    if (code == '404' || code == 'not_found' || code == 'entity_not_found') {
      return true;
    }
    if (code == '400' ||
        code == 'validation' ||
        code == 'validation_failure' ||
        code.startsWith('validation_')) {
      return true;
    }
    if (code == 'idempotency_payload_mismatch' ||
        code == 'idempotency_mismatch') {
      return true;
    }
    return false;
  }
}
