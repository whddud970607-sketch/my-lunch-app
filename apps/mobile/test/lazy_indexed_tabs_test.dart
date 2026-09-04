import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:delivery_shield_mobile/widgets/lazy_indexed_tabs.dart';

class _Probe extends StatefulWidget {
  const _Probe({required this.label, required this.builds});

  final String label;
  final Map<String, int> builds;

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
  Widget build(BuildContext context) => Text(widget.label);
}

void main() {
  testWidgets('lazy tabs instantiate current index only and keep state',
      (tester) async {
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
                itemBuilder: (_, i) => _Probe(
                  label: 'tab$i',
                  builds: builds,
                ),
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
}
