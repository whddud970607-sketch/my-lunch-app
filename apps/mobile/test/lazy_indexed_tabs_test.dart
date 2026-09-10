import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:delivery_shield_mobile/widgets/lazy_indexed_tabs.dart';

class _Probe extends StatefulWidget {
  const _Probe({required this.label, required this.builds, this.onDispose});

  final String label;
  final Map<String, int> builds;
  final VoidCallback? onDispose;

  @override
  State<_Probe> createState() => _ProbeState();
}

class _ProbeState extends State<_Probe> {
  @override
  void initState() {
    super.initState();
    widget.builds[widget.label] = (widget.builds[widget.label] ?? 0) + 1;
  }

  @override
  void dispose() {
    widget.onDispose?.call();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Text(widget.label);
}

void main() {
  testWidgets('lazy tabs instantiate current index only and keep state', (
    tester,
  ) async {
    final builds = <String, int>{};
    var index = 0;

    await tester.pumpWidget(
      MaterialApp(
        home: StatefulBuilder(
          builder: (context, setState) {
            return Scaffold(
              body: LazyIndexedTabs(
                index: index,
                itemCount: 3,
                itemBuilder: (_, i) => _Probe(label: 'tab$i', builds: builds),
              ),
              bottomNavigationBar: TextButton(
                onPressed: () => setState(() => index = 1),
                child: const Text('open-1'),
              ),
            );
          },
        ),
      ),
    );

    expect(find.text('tab0'), findsOneWidget);
    expect(builds['tab0'], 1);
    expect(builds['tab1'], isNull);

    await tester.tap(find.text('open-1'));
    await tester.pump();

    expect(builds['tab0'], 1);
    expect(builds['tab1'], 1);

    await tester.tap(find.text('open-1'));
    await tester.pump();
    expect(builds['tab1'], 1);
  });

  testWidgets('visited tab receives updated child props', (tester) async {
    var index = 1;
    var focus = 'none';

    await tester.pumpWidget(
      MaterialApp(
        home: StatefulBuilder(
          builder: (context, setState) {
            return Scaffold(
              body: LazyIndexedTabs(
                index: index,
                itemCount: 3,
                itemBuilder: (_, i) => Text(i == 1 ? 'map-$focus' : 'tab$i'),
              ),
              bottomNavigationBar: TextButton(
                onPressed: () => setState(() => focus = 'pt-1'),
                child: const Text('focus'),
              ),
            );
          },
        ),
      ),
    );

    expect(find.text('map-none'), findsOneWidget);
    await tester.tap(find.text('focus'));
    await tester.pump();
    expect(find.text('map-pt-1'), findsOneWidget);
  });

  testWidgets('ephemeral tab disposes when leaving and remounts on return', (
    tester,
  ) async {
    final builds = <String, int>{};
    var disposed = 0;
    var index = 0;

    await tester.pumpWidget(
      MaterialApp(
        home: StatefulBuilder(
          builder: (context, setState) {
            return Scaffold(
              body: LazyIndexedTabs(
                index: index,
                itemCount: 3,
                keepAliveForIndex: (i) => i != 1,
                itemBuilder: (_, i) => _Probe(
                  label: 'tab$i',
                  builds: builds,
                  onDispose: i == 1 ? () => disposed++ : null,
                ),
              ),
              bottomNavigationBar: Row(
                children: [
                  TextButton(
                    onPressed: () => setState(() => index = 1),
                    child: const Text('map'),
                  ),
                  TextButton(
                    onPressed: () => setState(() => index = 2),
                    child: const Text('delivery'),
                  ),
                ],
              ),
            );
          },
        ),
      ),
    );

    expect(find.text('tab0'), findsOneWidget);
    expect(find.text('tab1'), findsNothing);

    await tester.tap(find.text('map'));
    await tester.pump();
    expect(find.text('tab1'), findsOneWidget);
    expect(builds['tab1'], 1);
    expect(disposed, 0);

    await tester.tap(find.text('delivery'));
    await tester.pump();
    expect(find.text('tab1'), findsNothing);
    expect(find.text('tab2'), findsOneWidget);
    expect(disposed, 1);

    await tester.tap(find.text('map'));
    await tester.pump();
    expect(find.text('tab1'), findsOneWidget);
    expect(builds['tab1'], 2);
  });

  testWidgets('indexes 0-4 remain addressable with ephemeral map slot', (
    tester,
  ) async {
    var index = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: StatefulBuilder(
          builder: (context, setState) {
            return Scaffold(
              body: LazyIndexedTabs(
                index: index,
                itemCount: 5,
                keepAliveForIndex: (i) => i != 1,
                itemBuilder: (_, i) => Text('body-$i'),
              ),
              bottomNavigationBar: Wrap(
                children: List.generate(
                  5,
                  (i) => TextButton(
                    onPressed: () => setState(() => index = i),
                    child: Text('go-$i'),
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );

    for (final i in [0, 1, 2, 3, 4]) {
      await tester.tap(find.text('go-$i'));
      await tester.pump();
      expect(find.text('body-$i'), findsOneWidget);
      for (final j in [0, 1, 2, 3, 4]) {
        if (j == i) continue;
        if (j == 1) {
          expect(find.text('body-1'), findsNothing);
        }
      }
    }
  });
}
