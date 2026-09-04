import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:delivery_shield_mobile/config/app_info.dart';
import 'package:delivery_shield_mobile/models/me_response.dart';
import 'package:delivery_shield_mobile/screens/logout_confirm.dart';
import 'package:delivery_shield_mobile/screens/logout_keys.dart';
import 'package:delivery_shield_mobile/screens/menu_account_data.dart';
import 'package:delivery_shield_mobile/screens/menu_keys.dart';
import 'package:delivery_shield_mobile/screens/menu_screen.dart';
import 'package:delivery_shield_mobile/theme/app_theme.dart';
import 'package:delivery_shield_mobile/widgets/ds_card.dart';

void main() {
  Future<void> pumpMenu(
    WidgetTester tester, {
    MenuAccountView? account,
    Widget? debugTools,
  }) {
    return tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark(),
        home: MenuScreen(
          account: account ??
              const MenuAccountView(
                displayName: '기사',
                roleLabel: '배송 기사',
              ),
          versionLabel: AppInfo.userFacingVersion,
          onOpenMapSettings: () {},
          onLogout: () async {},
          debugTools: debugTools,
        ),
      ),
    );
  }

  testWidgets('MENU_TAB_REAL_SCREEN and MENU_NO_PLACEHOLDER', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark(),
        home: MenuScreen(
          account: const MenuAccountView(
            displayName: '기사',
            roleLabel: '배송 기사',
          ),
          versionLabel: AppInfo.userFacingVersion,
          onOpenMapSettings: () {},
          onLogout: () async {},
        ),
      ),
    );
    expect(find.byKey(MenuKeys.screen), findsOneWidget);
    expect(find.text('메뉴'), findsWidgets);
    expect(find.text('메뉴 준비 중'), findsNothing);
    expect(find.text('계정'), findsOneWidget);
    expect(find.text('지도/내비게이션'), findsOneWidget);
    expect(find.text('지원/정보'), findsOneWidget);
    expect(find.text('지도 설정'), findsOneWidget);
    expect(find.text(AppInfo.userFacingVersion), findsOneWidget);
    expect(find.text('로그아웃'), findsOneWidget);
  });

  testWidgets('MENU_NO_INTERNAL_UUID and related identifiers stay hidden',
      (tester) async {
    const uuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    await pumpMenu(
      tester,
      account: const MenuAccountView(
        displayName: '표시이름',
        roleLabel: '배송 기사',
      ),
    );
    expect(find.text(uuid), findsNothing);
    expect(find.textContaining('person_id'), findsNothing);
    expect(find.textContaining('driver_id'), findsNothing);
    expect(find.textContaining('userId'), findsNothing);
    expect(find.textContaining('Bearer'), findsNothing);
    expect(find.text('표시이름'), findsOneWidget);
  });

  testWidgets('DEBUG_TOOLS_NOT_PRODUCTION_PROMINENT without debug slot',
      (tester) async {
    await pumpMenu(tester);
    expect(find.byKey(MenuKeys.debugSection), findsNothing);
    expect(find.text('개발자 도구'), findsNothing);
    expect(find.text('TMAP Navigation POC'), findsNothing);
    expect(find.text('Kakao Navigation POC'), findsNothing);
    expect(find.text('남동구 fixture 지도 (dev)'), findsNothing);
  });

  testWidgets('debug tools stay isolated when provided', (tester) async {
    await pumpMenu(
      tester,
      debugTools: const DsCard(
        key: MenuKeys.debugSection,
        child: Text('개발자 도구'),
      ),
    );
    expect(find.byKey(MenuKeys.debugSection), findsOneWidget);
    expect(find.text('개발자 도구'), findsOneWidget);
    expect(find.text('TMAP Navigation POC'), findsNothing);
  });

  testWidgets('LOGOUT_CANCEL_NO_LOGOUT', (tester) async {
    var logoutCalls = 0;
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark(),
        home: MenuScreen(
          account: const MenuAccountView(
            displayName: '기사',
            roleLabel: '배송 기사',
          ),
          versionLabel: AppInfo.userFacingVersion,
          onOpenMapSettings: () {},
          onLogout: () async {
            logoutCalls++;
          },
        ),
      ),
    );

    await tester.tap(find.byKey(MenuKeys.logout));
    await tester.pumpAndSettle();
    expect(find.byKey(LogoutKeys.dialog), findsOneWidget);

    await tester.tap(find.byKey(LogoutKeys.cancel));
    await tester.pumpAndSettle();
    expect(find.byKey(LogoutKeys.dialog), findsNothing);
    expect(logoutCalls, 0);
  });

  testWidgets('LOGOUT_CONFIRM_EXISTING_PATH', (tester) async {
    var logoutCalls = 0;
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark(),
        home: MenuScreen(
          account: const MenuAccountView(
            displayName: '기사',
            roleLabel: '배송 기사',
          ),
          versionLabel: AppInfo.userFacingVersion,
          onOpenMapSettings: () {},
          onLogout: () async {
            logoutCalls++;
          },
        ),
      ),
    );

    await tester.tap(find.byKey(MenuKeys.logout));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(LogoutKeys.confirm));
    await tester.pumpAndSettle();
    expect(logoutCalls, 1);
    expect(find.byKey(LogoutKeys.dialog), findsNothing);
  });

  test('menuAccountView never copies internal ids', () {
    const me = MeResponse(
      userId: 'user-uuid-must-not-surface',
      email: 'hidden@example.com',
      role: 'driver',
      companyId: 'company-uuid-must-not-surface',
      displayName: '현장기사',
      driver: DriverInfo(
        id: 'driver-uuid-must-not-surface',
        companyId: 'company-uuid-must-not-surface',
        workStatus: 'active',
      ),
    );
    final view = menuAccountView(me);
    expect(view.displayName, '현장기사');
    expect(view.roleLabel, '배송 기사');
    expect(view.displayName.contains('uuid'), isFalse);
  });

  test('menuAccountView stays neutral without a display name', () {
    final view = menuAccountView(null);
    expect(view.displayName, '기사');
    expect(view.roleLabel, '계정');
  });

  test('shouldSignOut is fail-closed', () {
    expect(shouldSignOut(LogoutDecision.cancel), isFalse);
    expect(shouldSignOut(null), isFalse);
    expect(shouldSignOut(LogoutDecision.confirm), isTrue);
    expect(coerceLogoutDecision(true), LogoutDecision.cancel);
    expect(coerceLogoutDecision(null), LogoutDecision.cancel);
  });
}
