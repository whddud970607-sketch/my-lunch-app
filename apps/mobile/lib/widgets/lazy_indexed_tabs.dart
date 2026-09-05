import 'package:flutter/material.dart';

/// Builds tab bodies on first visit and keeps them alive in an [IndexedStack].
///
/// Unvisited indexes stay [SizedBox.shrink] so heavy tabs (maps) are not
/// constructed at app start.
class LazyIndexedTabs extends StatefulWidget {
  const LazyIndexedTabs({
    super.key,
    required this.index,
    required this.itemCount,
    required this.itemBuilder,
  });

  final int index;
  final int itemCount;
  final Widget Function(BuildContext context, int index) itemBuilder;

  @override
  State<LazyIndexedTabs> createState() => _LazyIndexedTabsState();
}

class _LazyIndexedTabsState extends State<LazyIndexedTabs> {
  final Set<int> _visited = {};

  @override
  Widget build(BuildContext context) {
    final index = widget.index.clamp(0, widget.itemCount - 1);
    _visited.add(index);

    return IndexedStack(
      index: index,
      sizing: StackFit.expand,
      children: List<Widget>.generate(widget.itemCount, (i) {
        if (!_visited.contains(i)) {
          return const SizedBox.shrink();
        }
        return KeyedSubtree(
          key: PageStorageKey<String>('lazy-tab-$i'),
          child: widget.itemBuilder(context, i),
        );
      }),
    );
  }
}
