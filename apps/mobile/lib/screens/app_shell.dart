import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../config/app_config.dart';
import '../config/app_info.dart';
import '../state/auth_controller.dart';
import '../state/delivery_session_controller.dart';
import '../widgets/lazy_indexed_tabs.dart';
import '../services/manual_address_repository.dart';
import 'app_shell_tabs.dart';
import 'delivery_list_screen.dart';
import 'home_screen.dart';
import 'manual_address_register_screen.dart';
import 'map_settings_screen.dart';
import 'map_spike_screen.dart';
import 'menu_account_data.dart';
import 'menu_debug_tools.dart';
import 'menu_screen.dart';
import 'scanner_screen.dart';

/// Authenticated shell: 5-tab bottom nav. Heavy tabs instantiate on first visit.
class AppShell extends StatefulWidget {
  const AppShell({
    super.key,
    required this.controller,
    required this.sessionController,
  });

  final AuthController controller;
  final DeliverySessionController sessionController;

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  int _index = 0;
  String? _mapFocusPointId;
  final ValueNotifier<int> _tabIndex = ValueNotifier(0);
  final ValueNotifier<int> _worksetRefreshTick = ValueNotifier(0);

  static const _tabCount = 5;

  void _goToTab(int index) {
    setState(() {
      _mapFocusPointId = null;
      _index = index;
    });
    _tabIndex.value = index;
  }

  void _goToMap({String? focusPointId}) {
    setState(() {
      _mapFocusPointId = focusPointId;
      _index = AppShellTabs.map;
    });
    _tabIndex.value = AppShellTabs.map;
  }

  @override
  void dispose() {
    _tabIndex.dispose();
    _worksetRefreshTick.dispose();
    super.dispose();
  }

  Future<void> _openManualAddressRegister(BuildContext context) async {
    final result = await Navigator.of(context).push<Object?>(
      MaterialPageRoute<Object?>(
        builder: (_) => ManualAddressRegisterScreen(
          repository: ManualAddressRepository(widget.controller.apiClient),
          serviceDate: AppConfig.instance.todayServiceDateOverride,
        ),
      ),
    );
    if (result != null && mounted) {
      _worksetRefreshTick.value++;
      _goToTab(AppShellTabs.delivery);
    }
  }

  Widget _tabAt(BuildContext context, int index) {
    switch (index) {
      case AppShellTabs.home:
        return HomeScreen(
          controller: widget.controller,
          sessionController: widget.sessionController,
          onSelectTab: _goToTab,
        );
      case AppShellTabs.map:
        return MapSpikeScreen(
          apiClient: widget.controller.apiClient,
          dataSource: DeliveryMapDataSource.today,
          driverId: widget.controller.me?.driver?.id,
          serviceDate: AppConfig.instance.todayServiceDateOverride,
          refreshTick: _worksetRefreshTick,
          focusPointId: _mapFocusPointId,
          onSelectTab: _goToTab,
        );
      case AppShellTabs.delivery:
        return DeliveryListScreen(
          controller: widget.controller,
          onSelectTab: _goToTab,
          onViewPointOnMap: (point) => _goToMap(focusPointId: point.pointId),
          refreshTick: _worksetRefreshTick,
        );
      case AppShellTabs.scan:
        return ScannerScreen(
          tabIndex: _tabIndex,
          scanTabIndex: AppShellTabs.scan,
          onRegisterByAddress: () => _openManualAddressRegister(context),
        );
      case AppShellTabs.menu:
        return MenuScreen(
          account: menuAccountView(widget.controller.me),
          versionLabel: AppInfo.userFacingVersion,
          onOpenMapSettings: () {
            Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => const MapSettingsScreen(),
              ),
            );
          },
          onLogout: () async {
            await widget.sessionController.onSignOut();
            await widget.controller.signOut();
          },
          debugTools: kDebugMode
              ? MenuDebugTools(
                  apiClient: widget.controller.apiClient,
                  driverId: widget.controller.me?.driver?.id,
                  serviceDateOverride:
                      AppConfig.instance.todayServiceDateOverride,
                )
              : null,
        );
      default:
        return const SizedBox.shrink();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: LazyIndexedTabs(
        index: _index,
        itemCount: _tabCount,
        itemBuilder: _tabAt,
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: _goToTab,
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.home_outlined),
            selectedIcon: Icon(Icons.home),
            label: '홈',
          ),
          NavigationDestination(
            icon: Icon(Icons.map_outlined),
            selectedIcon: Icon(Icons.map),
            label: '지도',
          ),
          NavigationDestination(
            icon: Icon(Icons.local_shipping_outlined),
            selectedIcon: Icon(Icons.local_shipping),
            label: '배송',
          ),
          NavigationDestination(
            icon: Icon(Icons.qr_code_scanner_outlined),
            selectedIcon: Icon(Icons.qr_code_scanner),
            label: '스캔',
          ),
          NavigationDestination(
            icon: Icon(Icons.menu),
            selectedIcon: Icon(Icons.menu),
            label: '메뉴',
          ),
        ],
      ),
    );
  }
}
