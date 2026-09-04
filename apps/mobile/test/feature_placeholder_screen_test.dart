import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:delivery_shield_mobile/screens/feature_placeholder_screen.dart';
import 'package:delivery_shield_mobile/theme/app_theme.dart';

void main() {
  testWidgets('placeholder states it is not a live feature', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark(),
        home: const FeaturePlaceholderScreen(
          title: '메뉴',
          message: '메뉴 준비 중',
        ),
      ),
    );

    expect(find.text('메뉴'), findsWidgets);
    expect(find.text('메뉴 준비 중'), findsOneWidget);
  });
}
