import 'package:flutter/material.dart';

/// Builds tab bodies on first visit and keeps them alive in an [IndexedStack].
///
/// Unvisited indexes stay [SizedBox.shrink] so heavy tabs (maps) are not
/// constructed at app start.
///
/// Tabs where [keepAliveForIndex] returns false are mounted **only while
/// selected**. Leaving them removes the subtree so native PlatformViews
/// (Android maps) cannot overlay sibling Flutter tabs.
class LazyIndexedTabs extends StatefulWidget {
  const LazyIndexedTabs({
    super.key,
    required this.index,
    required this.itemCount,
    required this.itemBuilder,
    this.keepAliveForIndex,
  });

  final int index;
  final int itemCount;
  final Widget Function(BuildContext context, int index) itemBuilder;

  /// Defaults to always true (legacy keep-alive for all visited tabs).
  final bool Function(int index)? keepAliveForIndex;

  @override
  State<LazyIndexedTabs> createState() => _LazyIndexedTabsState();
}

class _LazyIndexedTabsState extends State<LazyIndexedTabs> {
  final Set<int> _visited = {};

  bool _keepAlive(int i) => widget.keepAliveForIndex?.call(i) ?? true;

  @override
  Widget build(BuildContext context) {
    final index = widget.index.clamp(0, widget.itemCount - 1);
    if (_keepAlive(index)) {
      _visited.add(index);
    }

    // ignore: avoid_print — release logcat P0 verification
    print('DS_TAB selected=$index');

    return IndexedStack(
      index: index,
      sizing: StackFit.expand,
      children: List<Widget>.generate(widget.itemCount, (i) {
        final active = i == index;
        final mount = active || (_keepAlive(i) && _visited.contains(i));
        if (!mount) {
          return const SizedBox.shrink();
        }
        if (active && !_keepAlive(i)) {
          // ignore: avoid_print — release logcat P0 verification
          print('DS_TAB_BUILD index=$i (ephemeral)');
        }
        return KeyedSubtree(
          key: PageStorageKey<String>(
            _keepAlive(i) ? 'lazy-tab-$i' : 'lazy-tab-$i-ephemeral',
          ),
          child: widget.itemBuilder(context, i),
        );
      }),
    );
  }
}
