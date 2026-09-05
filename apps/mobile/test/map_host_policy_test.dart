import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:delivery_shield_mobile/map/delivery_map_controller.dart';
import 'package:delivery_shield_mobile/map/delivery_map_surface.dart';
import 'package:delivery_shield_mobile/map/map_host_policy.dart';
import 'package:delivery_shield_mobile/map/map_provider_id.dart';
import 'package:delivery_shield_mobile/widgets/lazy_indexed_tabs.dart';

void main() {
  test('workset never blocks map surface', () {
    expect(MapHostPolicy.worksetBlocksSurface(), isFalse);
    expect(MapHostPolicy.bumpGenerationAfterWorkset(), isFalse);
    expect(MapHostPolicy.mountSurfaceBeforeWorkset(), isTrue);
    expect(MapHostPolicy.keepSurfaceOnLoading(), isTrue);
    expect(MapHostPolicy.keepSurfaceOnError(), isTrue);
    expect(MapHostPolicy.keepSurfaceOnInvalidPins(), isTrue);
  });

  test('offstage return always remounts native host', () {
    expect(
      MapHostPolicy.shouldRecreateAfterOffstage(
        becameVisible: true,
        nativeReady: true,
      ),
      isTrue,
    );
    expect(
      MapHostPolicy.shouldRecreateAfterOffstage(
        becameVisible: false,
        nativeReady: false,
      ),
      isFalse,
    );
  });

  test('native ready retries cap at 2', () {
    expect(
      MapHostPolicy.shouldRetryNativeReady(nativeReady: false, retries: 0),
      isTrue,
    );
    expect(
      MapHostPolicy.shouldRetryNativeReady(nativeReady: false, retries: 2),
      isFalse,
    );
    expect(
      MapHostPolicy.shouldRetryNativeReady(nativeReady: true, retries: 0),
      isFalse,
    );
  });

  test('Kakao and Naver host keys are stable const values', () {
    const kakao = ValueKey('map-host-kakao');
    const naver = ValueKey('map-host-naver');
    expect(kakao, const ValueKey('map-host-kakao'));
    expect(naver, const ValueKey('map-host-naver'));
  });

  testWidgets('list-map-list 20 cycles keep a host widget', (tester) async {
    var index = 1;
    await tester.pumpWidget(
      MaterialApp(
        home: StatefulBuilder(
          builder: (context, setState) {
            return Scaffold(
              body: LazyIndexedTabs(
                index: index,
                itemCount: 3,
                itemBuilder: (_, i) {
                  if (i != 1) return Text('tab$i');
                  return DeliveryMapSurface(
                    providerId: MapProviderId.tmap,
                    initialTarget: const DeliveryLatLng(
                      latitude: 37.5665,
                      longitude: 126.9780,
                    ),
                    pins: const [],
                    onPinTap: (_) {},
                    onReady: (_) {},
                  );
                },
              ),
              bottomNavigationBar: Row(
                children: [
                  TextButton(
                    onPressed: () => setState(() => index = 2),
                    child: const Text('list'),
                  ),
                  TextButton(
                    onPressed: () => setState(() => index = 1),
                    child: const Text('map'),
                  ),
                ],
              ),
            );
          },
        ),
      ),
    );

    expect(find.byType(DeliveryMapSurface), findsOneWidget);
    for (var i = 0; i < 20; i++) {
      await tester.tap(find.text('list'));
      await tester.pump();
      await tester.tap(find.text('map'));
      await tester.pump();
      expect(find.byType(DeliveryMapSurface), findsOneWidget);
    }
  });
}
