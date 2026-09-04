import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:delivery_shield_mobile/theme/app_theme.dart';

void main() {
  testWidgets('shell destinations are Korean labels', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark(),
        home: Scaffold(
          bottomNavigationBar: NavigationBar(
            selectedIndex: 0,
            onDestinationSelected: (_) {},
            destinations: const [
              NavigationDestination(
                icon: Icon(Icons.home_outlined),
                label: '홈',
              ),
              NavigationDestination(
                icon: Icon(Icons.map_outlined),
                label: '지도',
              ),
              NavigationDestination(
                icon: Icon(Icons.local_shipping_outlined),
                label: '배송',
              ),
              NavigationDestination(
                icon: Icon(Icons.qr_code_scanner),
                label: '스캔',
              ),
              NavigationDestination(
                icon: Icon(Icons.menu),
                label: '메뉴',
              ),
            ],
          ),
        ),
      ),
    );

    expect(find.text('홈'), findsOneWidget);
    expect(find.text('지도'), findsOneWidget);
    expect(find.text('배송'), findsOneWidget);
    expect(find.text('스캔'), findsOneWidget);
    expect(find.text('메뉴'), findsOneWidget);
  });
}
