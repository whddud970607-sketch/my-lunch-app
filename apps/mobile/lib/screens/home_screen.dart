import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../config/app_config.dart';
import '../copy/delivery_report_copy.dart';
import '../models/today_workset.dart';
import '../utils/workday_end_hint.dart';
import '../services/api_exception.dart';
import '../navigation/kakao_navi_poc_bridge.dart';
import '../services/today_workset_repository.dart';
import '../state/auth_controller.dart';
import '../state/delivery_session_controller.dart';
import 'delivery_report_screen.dart';
import 'map_settings_screen.dart';
import 'map_spike_screen.dart';

enum _HomeLoadState { loading, loaded, empty, error, refreshing }

class HomeScreen extends StatefulWidget {
  const HomeScreen({
    super.key,
    required this.controller,
    required this.sessionController,
  });

  final AuthController controller;
  final DeliverySessionController sessionController;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  TodayWorkset? _workset;
  String? _listError;
  _HomeLoadState _loadState = _HomeLoadState.loading;

  late final TodayWorksetRepository _todayRepo =
      TodayWorksetRepository(widget.controller.apiClient);

  @override
  void initState() {
    super.initState();
    widget.sessionController.addListener(_onSessionChanged);
    _loadToday(isRefresh: false);
  }

  @override
  void dispose() {
    widget.sessionController.removeListener(_onSessionChanged);
    super.dispose();
  }

  void _onSessionChanged() {
    if (mounted) setState(() {});
  }

  String? get _serviceDateOverride {
    final fromConfig = AppConfig.instance.todayServiceDateOverride;
    if (fromConfig != null && fromConfig.isNotEmpty) return fromConfig;
    return null;
  }

  Future<void> _loadToday({required bool isRefresh}) async {
    final hadData = _workset != null;
    setState(() {
      _loadState =
          isRefresh ? _HomeLoadState.refreshing : _HomeLoadState.loading;
      if (!isRefresh) _listError = null;
    });
    try {
      final result = await _todayRepo.fetchToday(
        serviceDate: _serviceDateOverride,
      );
      if (!mounted) return;
      setState(() {
        _workset = result.workset;
        _listError = null;
        _loadState = result.workset.isEmpty
            ? _HomeLoadState.empty
            : _HomeLoadState.loaded;
      });
      debugPrint(
        '[timing] today_home_api_ms=${result.apiMs} '
        'points=${result.workset.points.length} '
        'jobs=${result.workset.jobs.length}',
      );
      // Membership reconcile only after successful Today refresh + active work.
      await widget.sessionController.reconcileAfterTodayRefresh();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _listError = e.message;
        if (hadData) {
          _loadState = _HomeLoadState.loaded;
        } else {
          _workset = null;
          _loadState = _HomeLoadState.error;
        }
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _listError = '배송 목록을 불러오지 못했습니다';
        if (hadData) {
          _loadState = _HomeLoadState.loaded;
        } else {
          _workset = null;
          _loadState = _HomeLoadState.error;
        }
      });
    }
  }

  String _formatElapsed(int seconds) {
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

  Future<String?> _pickJobFromIds(List<String> membershipJobIds) async {
    if (membershipJobIds.isEmpty) return null;
    if (membershipJobIds.length == 1) return membershipJobIds.first;

    final workset = _workset;
    final selected = await showDialog<String>(
      context: context,
      builder: (ctx) {
        return SimpleDialog(
          title: const Text('배송 Job 선택'),
          children: [
            for (final jobId in membershipJobIds)
              SimpleDialogOption(
                onPressed: () => Navigator.pop(ctx, jobId),
                child: Text(_jobLabelForId(workset, jobId)),
              ),
            SimpleDialogOption(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('취소'),
            ),
          ],
        );
      },
    );
    return selected;
  }

  String _jobLabelForId(TodayWorkset? workset, String jobId) {
    if (workset == null) {
      return 'Job ${jobId.length > 8 ? jobId.substring(0, 8) : jobId}…';
    }
    WorksetJob? job;
    for (final j in workset.jobs) {
      if (j.id == jobId) {
        job = j;
        break;
      }
    }
    if (job == null) {
      return 'Job ${jobId.length > 8 ? jobId.substring(0, 8) : jobId}…';
    }
    return _jobOptionLabel(workset, job);
  }

  String _jobOptionLabel(TodayWorkset workset, WorksetJob job) {
    final source = workset.sourceById(job.sourceId);
    final company = workset.companyById(job.companyId);
    final parts = <String>[];
    final companyName = (company?.displayName ?? '').trim();
    if (companyName.isNotEmpty) {
      parts.add(companyName);
    } else if (job.companyId == null) {
      parts.add('직접추가');
    }
    final sourceName = (source?.displayName ?? '').trim();
    if (sourceName.isNotEmpty) parts.add(sourceName);
    parts.add(job.status);
    return parts.join(' · ');
  }

  Future<void> _openMap({
    String? focusPointId,
    TodayWorkset? workset,
    DeliveryMapDataSource source = DeliveryMapDataSource.today,
  }) async {
    final driverId = widget.controller.me?.driver?.id;
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => MapSpikeScreen(
          apiClient: widget.controller.apiClient,
          dataSource: source,
          focusPointId: focusPointId,
          driverId: driverId,
          serviceDate: _serviceDateOverride,
          initialWorkset:
              source == DeliveryMapDataSource.today ? workset : null,
        ),
      ),
    );
    if (mounted) await _loadToday(isRefresh: true);
  }

  Future<void> _launchKakaoNaviPoc() async {
    try {
      await KakaoNaviPocBridge.launch(
        appKey: AppConfig.instance.kakaoNativeAppKey,
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Kakao Navigation POC unavailable ($e)')),
      );
    }
  }

  Future<void> _onStartDelivery() async {
    final driverId = widget.controller.me?.driver?.id;
    if (driverId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('기사 프로필이 없습니다.')),
      );
      return;
    }

    if (widget.sessionController.needsEndRecovery) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('배송 종료 처리가 진행 중입니다. 다시 시도해 주세요.')),
      );
      return;
    }

    final outcome = await widget.sessionController.startTodayDelivery(
      driverId: driverId,
      selectJob: _pickJobFromIds,
    );
    if (!mounted) return;

    switch (outcome) {
      case DeliveryStartOutcome.started:
      case DeliveryStartOutcome.alreadyActive:
        await _openMap(workset: _workset);
      case DeliveryStartOutcome.cancelled:
        // Workday may remain active without Session — stay on Home.
        break;
      case DeliveryStartOutcome.blocked:
        final blockedMsg = widget.sessionController.errorMessage ??
            '배송 종료 처리가 진행 중입니다.';
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(blockedMsg)),
        );
      case DeliveryStartOutcome.failed:
        final msg = widget.sessionController.errorMessage;
        if (msg != null && msg.isNotEmpty) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(msg)),
          );
        }
    }
  }

  Future<void> _onEndDelivery() async {
    final sessionCtrl = widget.sessionController;
    final hadSession = sessionCtrl.session;
    if (!sessionCtrl.canEndDelivery && !sessionCtrl.needsEndRecovery) {
      return;
    }

    final b3WorkdayPath = WorkdayEndHint.isB3WorkdayPath(
      b3ExecutionEnabled: AppConfig.instance.workdayExecutionSessionV1,
      workday: sessionCtrl.workday,
    );
    final incompleteHint = WorkdayEndHint.resolveIncompleteHint(
      b3ExecutionEnabled: AppConfig.instance.workdayExecutionSessionV1,
      workday: sessionCtrl.workday,
      todayRemainingPoints: _workset?.summary.remainingPoints,
    );

    var force = false;
    if (incompleteHint != null &&
        incompleteHint > 0 &&
        sessionCtrl.phase != DeliveryLifecyclePhase.endRetryable &&
        sessionCtrl.phase != DeliveryLifecyclePhase.ending) {
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('배송 종료'),
          content: Text(
            DeliveryReportCopy.incompleteEndWarning(incompleteHint),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('계속 배송하기'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('배송 종료'),
            ),
          ],
        ),
      );
      if (confirmed != true) return;
      force = true;
    }

    final needConfirm = await sessionCtrl.endTodayDelivery(
      forceIncomplete: force,
    );
    if (!mounted) return;

    if (needConfirm != null && needConfirm != 0) {
      final String confirmMessage;
      if (needConfirm > 0) {
        confirmMessage = DeliveryReportCopy.incompleteEndWarning(needConfirm);
      } else if (incompleteHint != null && incompleteHint > 0) {
        confirmMessage = DeliveryReportCopy.incompleteEndWarning(incompleteHint);
      } else if (b3WorkdayPath) {
        confirmMessage = DeliveryReportCopy.incompleteEndWarningGeneric();
      } else {
        confirmMessage = DeliveryReportCopy.incompleteEndWarning(0);
      }
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('배송 종료'),
          content: Text(confirmMessage),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('계속 배송하기'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('배송 종료'),
            ),
          ],
        ),
      );
      if (confirmed != true) return;
      await sessionCtrl.endTodayDelivery(forceIncomplete: true);
    }

    if (!mounted) return;
    if (sessionCtrl.errorMessage != null &&
        sessionCtrl.needsEndRecovery) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(sessionCtrl.errorMessage!)),
      );
      return;
    }
    if (sessionCtrl.errorMessage != null &&
        sessionCtrl.session?.status != 'completed' &&
        hadSession?.status != 'completed') {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(sessionCtrl.errorMessage!)),
      );
      return;
    }

    final endedId = sessionCtrl.session?.id ?? hadSession?.id;
    final workdayReportId = sessionCtrl.lastCompletedWorkdayId;
    if (workdayReportId != null && sessionCtrl.preferWorkdayReport) {
      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => DeliveryReportScreen(
            apiClient: widget.controller.apiClient,
            sessionController: sessionCtrl,
            workdayId: workdayReportId,
          ),
        ),
      );
      sessionCtrl.clearCompletedSession();
    } else if (endedId != null) {
      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => DeliveryReportScreen(
            apiClient: widget.controller.apiClient,
            sessionController: sessionCtrl,
            sessionId: endedId,
          ),
        ),
      );
      sessionCtrl.clearCompletedSession();
    }
    if (mounted) await _loadToday(isRefresh: true);
  }

  @override
  Widget build(BuildContext context) {
    final controller = widget.controller;
    final sessionCtrl = widget.sessionController;
    final me = controller.me;
    final name = me?.displayName?.trim().isNotEmpty == true
        ? me!.displayName!
        : (me?.email ?? '기사');

    final summary = _workset?.summary;
    final total = summary?.totalPoints ?? 0;
    final completed = summary?.completedPoints ?? 0;
    final remaining = summary?.remainingPoints ?? 0;
    final shipments = summary?.totalShipments ?? 0;
    final phase = sessionCtrl.phase;
    final inProgress = sessionCtrl.isDeliveryInProgress;
    final needsRecovery = sessionCtrl.needsEndRecovery;
    final startedAt = sessionCtrl.displayStartedAt;
    final busyLoad = _loadState == _HomeLoadState.loading ||
        _loadState == _HomeLoadState.refreshing;

    String statusTitle;
    if (needsRecovery) {
      statusTitle = '배송 종료 처리 중';
    } else if (phase == DeliveryLifecyclePhase.activeNoSession) {
      statusTitle = '배송 업무 시작됨';
    } else if (phase == DeliveryLifecyclePhase.active ||
        phase == DeliveryLifecyclePhase.starting) {
      statusTitle = '배송 중';
    } else {
      statusTitle = '오늘 배송';
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('기사 홈'),
        actions: [
          IconButton(
            tooltip: '지도 설정',
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => const MapSettingsScreen(),
                ),
              );
            },
            icon: const Icon(Icons.settings_outlined),
          ),
          IconButton(
            tooltip: '로그아웃',
            onPressed: () async {
              await sessionCtrl.onSignOut();
              await controller.signOut();
            },
            icon: const Icon(Icons.logout),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          await controller.refreshMe();
          await sessionCtrl.refreshActive();
          await _loadToday(isRefresh: true);
        },
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Text(
              name,
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 4),
            Text(
              'role: ${me?.role ?? '-'} · driver: ${me?.driver?.id ?? '-'}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            if (_serviceDateOverride != null) ...[
              const SizedBox(height: 4),
              Text(
                'dev serviceDate=$_serviceDateOverride',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Theme.of(context).colorScheme.tertiary,
                    ),
              ),
            ],
            const SizedBox(height: 20),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      statusTitle,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    if (inProgress && startedAt != null) ...[
                      const SizedBox(height: 8),
                      Text(
                        '시작: ${startedAt.toLocal()}',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                      Text(
                        '경과: ${_formatElapsed(sessionCtrl.displayElapsedSeconds)}',
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                      Text(
                        '전체 $total · 완료 $completed · 남음 $remaining',
                      ),
                      const SizedBox(height: 12),
                      if (needsRecovery)
                        FilledButton(
                          onPressed:
                              sessionCtrl.busy ? null : _onEndDelivery,
                          child: sessionCtrl.busy
                              ? const SizedBox(
                                  height: 20,
                                  width: 20,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                  ),
                                )
                              : const Text('다시 시도'),
                        )
                      else if (phase == DeliveryLifecyclePhase.active ||
                          (phase == DeliveryLifecyclePhase.activeNoSession &&
                              sessionCtrl.canEndDelivery))
                        FilledButton(
                          onPressed:
                              sessionCtrl.busy ? null : _onEndDelivery,
                          child: sessionCtrl.busy
                              ? const SizedBox(
                                  height: 20,
                                  width: 20,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                  ),
                                )
                              : const Text('배송 종료'),
                        ),
                      if (phase == DeliveryLifecyclePhase.activeNoSession &&
                          !needsRecovery &&
                          sessionCtrl.needsB2JobPicker) ...[
                        const SizedBox(height: 8),
                        OutlinedButton(
                          onPressed: sessionCtrl.busy ||
                                  _loadState == _HomeLoadState.loading
                              ? null
                              : _onStartDelivery,
                          child: const Text('배송 계속하기'),
                        ),
                      ],
                    ] else ...[
                      const SizedBox(height: 12),
                      FilledButton(
                        onPressed: !sessionCtrl.canStartDelivery ||
                                _loadState == _HomeLoadState.loading
                            ? null
                            : _onStartDelivery,
                        child: sessionCtrl.busy
                            ? const SizedBox(
                                height: 20,
                                width: 20,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                ),
                              )
                            : const Text('오늘 배송 시작'),
                      ),
                    ],
                  ],
                ),
              ),
            ),
            const SizedBox(height: 24),
            Text('오늘의 배송', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            if (_loadState == _HomeLoadState.loading)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 16),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_loadState == _HomeLoadState.error)
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(_listError ?? '오류'),
                      const SizedBox(height: 8),
                      OutlinedButton(
                        onPressed: () => _loadToday(isRefresh: false),
                        child: const Text('다시 시도'),
                      ),
                    ],
                  ),
                ),
              )
            else if (_loadState == _HomeLoadState.empty)
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Text('오늘 배정된 배송이 없습니다.'),
                      const SizedBox(height: 8),
                      OutlinedButton(
                        onPressed: () => _loadToday(isRefresh: true),
                        child: const Text('새로고침'),
                      ),
                    ],
                  ),
                ),
              )
            else
              Card(
                child: Column(
                  children: [
                    if (_listError != null)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                        child: Text(
                          '최신 동기화 실패 · 이전 데이터 표시 중',
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ),
                    for (final p in _workset?.points ?? const <WorksetPoint>[])
                      ListTile(
                        dense: true,
                        title: Text(
                          p.displayLabel.isNotEmpty
                              ? p.displayLabel
                              : '배송 ${p.pointId.substring(0, 8)}…',
                        ),
                        subtitle: Text(
                          '${p.status} · qty ${p.quantity}'
                          '${p.sourceId != null ? ' · src' : ''}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        trailing: Text('${p.quantity}'),
                        onTap: () => _openMap(
                          focusPointId: p.pointId,
                          workset: _workset,
                        ),
                      ),
                  ],
                ),
              ),
            const SizedBox(height: 20),
            Text(
              '요약',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                _StatChip(
                  label: '전체',
                  value: busyLoad && _workset == null ? '—' : '$total',
                ),
                _StatChip(
                  label: '완료',
                  value: busyLoad && _workset == null ? '—' : '$completed',
                ),
                _StatChip(
                  label: '남음',
                  value: busyLoad && _workset == null ? '—' : '$remaining',
                ),
                _StatChip(
                  label: '송장',
                  value: busyLoad && _workset == null ? '—' : '$shipments',
                ),
                _StatChip(
                  label: 'Job',
                  value: busyLoad && _workset == null
                      ? '—'
                      : '${_workset?.jobs.length ?? 0}',
                ),
              ],
            ),
            const SizedBox(height: 32),
            OutlinedButton(
              onPressed: () => _openMap(workset: _workset),
              child: const Text('지도에서 보기'),
            ),
            if (kDebugMode) ...[
              const SizedBox(height: 24),
              Text(
                '개발용',
                style: Theme.of(context).textTheme.titleSmall,
              ),
              const SizedBox(height: 8),
              OutlinedButton(
                onPressed: () => _openMap(
                  source: DeliveryMapDataSource.namdong10,
                ),
                child: const Text('남동구 fixture 지도 (dev)'),
              ),
              OutlinedButton(
                onPressed: () => _openMap(
                  source: DeliveryMapDataSource.singleSpike,
                ),
                child: const Text('단일 Spike 지도 (dev)'),
              ),
              OutlinedButton(
                onPressed: _launchKakaoNaviPoc,
                child: const Text('Kakao Navigation POC'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _StatChip extends StatelessWidget {
  const _StatChip({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Chip(
      label: Text('$label $value'),
    );
  }
}
