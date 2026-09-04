import 'package:flutter/material.dart';

import '../config/app_config.dart';
import '../copy/driver_chrome_copy.dart';
import '../copy/delivery_report_copy.dart';
import '../models/today_workset.dart';
import '../services/api_exception.dart';
import '../services/today_workset_repository.dart';
import '../state/auth_controller.dart';
import '../state/delivery_session_controller.dart';
import '../utils/workday_end_hint.dart';
import 'app_shell_tabs.dart';
import 'delivery_report_screen.dart';
import 'workday_end_confirm.dart';
import 'home_dashboard.dart';
import 'home_dashboard_data.dart';
import 'map_spike_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({
    super.key,
    required this.controller,
    required this.sessionController,
    this.onSelectTab,
  });

  final AuthController controller;
  final DeliverySessionController sessionController;
  final ValueChanged<int>? onSelectTab;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  TodayWorkset? _workset;
  String? _listError;
  HomeDashboardLoadState _loadState = HomeDashboardLoadState.loading;
  bool _workdayEndInFlight = false;

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
      _loadState = isRefresh
          ? HomeDashboardLoadState.refreshing
          : HomeDashboardLoadState.loading;
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
            ? HomeDashboardLoadState.empty
            : HomeDashboardLoadState.loaded;
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
          _loadState = HomeDashboardLoadState.loaded;
        } else {
          _workset = null;
          _loadState = HomeDashboardLoadState.error;
        }
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _listError = DriverChromeCopy.loadListFailed;
        if (hadData) {
          _loadState = HomeDashboardLoadState.loaded;
        } else {
          _workset = null;
          _loadState = HomeDashboardLoadState.error;
        }
      });
    }
  }

  Future<String?> _pickJobFromIds(List<String> membershipJobIds) async {
    if (membershipJobIds.isEmpty) return null;
    if (membershipJobIds.length == 1) return membershipJobIds.first;

    final workset = _workset;
    final selected = await showDialog<String>(
      context: context,
      builder: (ctx) {
        return SimpleDialog(
          title: const Text('오늘 배송 선택'),
          children: [
            for (var i = 0; i < membershipJobIds.length; i++)
              SimpleDialogOption(
                onPressed: () => Navigator.pop(ctx, membershipJobIds[i]),
                child: Text(
                  _jobLabelForId(
                    workset,
                    membershipJobIds[i],
                    fallbackIndex: i + 1,
                  ),
                ),
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

  String _jobLabelForId(
    TodayWorkset? workset,
    String jobId, {
    required int fallbackIndex,
  }) {
    if (workset == null) return '배송 $fallbackIndex';
    WorksetJob? job;
    for (final j in workset.jobs) {
      if (j.id == jobId) {
        job = j;
        break;
      }
    }
    if (job == null) return '배송 $fallbackIndex';
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

  void _selectTab(int index) {
    widget.onSelectTab?.call(index);
  }

  Future<void> _openTodayMapTab() async {
    if (widget.onSelectTab != null) {
      _selectTab(AppShellTabs.map);
      return;
    }
    await _openMap(workset: _workset);
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
        await _openTodayMapTab();
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
    if (_workdayEndInFlight || sessionCtrl.busy) return;
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
    final recovering = sessionCtrl.phase == DeliveryLifecyclePhase.endRetryable ||
        sessionCtrl.phase == DeliveryLifecyclePhase.ending;

    setState(() => _workdayEndInFlight = true);
    try {
      if (!recovering) {
        final b3Unknown = WorkdayEndConfirmCopy.isUnknownRemaining(
          b3WorkdayPath: b3WorkdayPath,
          remainingHint: incompleteHint,
        );
        final decision = await showWorkdayEndConfirmDialog(
          context: context,
          message: WorkdayEndConfirmCopy.body(
            remainingHint: incompleteHint,
            b3Unknown: b3Unknown,
          ),
          warnRemaining: WorkdayEndConfirmCopy.shouldWarnRemaining(
            incompleteHint,
          ),
        );
        if (!shouldCallEndTodayDelivery(decision)) return;
        force = WorkdayEndConfirmCopy.shouldWarnRemaining(incompleteHint);
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
          confirmMessage =
              DeliveryReportCopy.incompleteEndWarning(incompleteHint);
        } else if (b3WorkdayPath) {
          confirmMessage = DeliveryReportCopy.incompleteEndWarningGeneric();
        } else {
          confirmMessage = DeliveryReportCopy.incompleteEndWarning(0);
        }
        final second = await showWorkdayEndConfirmDialog(
          context: context,
          message: confirmMessage,
          warnRemaining: true,
        );
        if (!shouldCallEndTodayDelivery(second)) return;
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

      await _openCompletedReport(
        endedSessionId: sessionCtrl.session?.id ?? hadSession?.id,
      );
      if (mounted) await _loadToday(isRefresh: true);
    } finally {
      if (mounted) setState(() => _workdayEndInFlight = false);
    }
  }

  Future<void> _openCompletedReport({String? endedSessionId}) async {
    final sessionCtrl = widget.sessionController;
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
    } else if (endedSessionId != null) {
      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => DeliveryReportScreen(
            apiClient: widget.controller.apiClient,
            sessionController: sessionCtrl,
            sessionId: endedSessionId,
          ),
        ),
      );
      sessionCtrl.clearCompletedSession();
    }
  }

  @override
  Widget build(BuildContext context) {
    final controller = widget.controller;
    final sessionCtrl = widget.sessionController;
    final me = controller.me;
    final name = me?.displayName?.trim().isNotEmpty == true
        ? me!.displayName!
        : '기사';
    final dateLabel = formatHomeServiceDate(
      _workset?.serviceDate.isNotEmpty == true
          ? _workset!.serviceDate
          : _serviceDateOverride,
      DateTime.now(),
    );
    final canOpenReport = sessionCtrl.phase == DeliveryLifecyclePhase.completed &&
        (sessionCtrl.lastCompletedWorkdayId != null ||
            sessionCtrl.session?.id != null);

    return Scaffold(
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () async {
            await controller.refreshMe();
            await sessionCtrl.refreshActive();
            await _loadToday(isRefresh: true);
          },
          child: HomeDashboard(
            driverDisplayName: name,
            dateLabel: dateLabel,
            phase: sessionCtrl.phase,
            needsRecovery: sessionCtrl.needsEndRecovery,
            inProgress: sessionCtrl.isDeliveryInProgress,
            canStartDelivery: sessionCtrl.canStartDelivery,
            canEndDelivery: sessionCtrl.canEndDelivery,
            needsB2JobPicker: sessionCtrl.needsB2JobPicker,
            sessionBusy: sessionCtrl.busy || _workdayEndInFlight,
            loadState: _loadState,
            elapsedLabel: formatElapsed(sessionCtrl.displayElapsedSeconds),
            workset: _workset,
            listError: _listError,
            onStartDelivery: _onStartDelivery,
            onEndDelivery: _onEndDelivery,
            onContinueDelivery: _onStartDelivery,
            onRetryToday: () => _loadToday(isRefresh: false),
            onOpenMapTab: _openTodayMapTab,
            onOpenScanTab: () => _selectTab(AppShellTabs.scan),
            onViewTodayWork: canOpenReport
                ? () => _openCompletedReport(
                      endedSessionId: sessionCtrl.session?.id,
                    )
                : null,
          ),
        ),
      ),
    );
  }
}
