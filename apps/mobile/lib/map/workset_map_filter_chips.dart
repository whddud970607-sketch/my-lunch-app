import '../models/today_workset.dart';
import 'workset_map_filter.dart';

enum MapFilterChipKind { all, company, source, manual }

/// Presentation spec for a map filter chip. Identity stays on [filter].
class MapFilterChipSpec {
  const MapFilterChipSpec({
    required this.label,
    required this.filter,
    required this.kind,
  });

  final String label;
  final WorksetMapFilter filter;
  final MapFilterChipKind kind;
}

/// Builds company/source chips from a real TodayWorkset. Never invents names.
abstract final class WorksetMapFilterChips {
  static List<MapFilterChipSpec> fromWorkset(TodayWorkset? workset) {
    final chips = <MapFilterChipSpec>[
      const MapFilterChipSpec(
        label: '전체',
        filter: WorksetMapFilter.all,
        kind: MapFilterChipKind.all,
      ),
    ];
    if (workset == null) return List<MapFilterChipSpec>.unmodifiable(chips);

    final companyIds = <String?>{};
    for (final p in workset.points) {
      companyIds.add(p.companyId);
    }
    for (final id in companyIds) {
      if (id == null) {
        chips.add(
          const MapFilterChipSpec(
            label: '직접추가',
            filter: WorksetMapFilterCompany(null),
            kind: MapFilterChipKind.company,
          ),
        );
        continue;
      }
      final name = workset.companyById(id)?.displayName.trim() ?? '';
      if (name.isEmpty) continue;
      chips.add(
        MapFilterChipSpec(
          label: name,
          filter: WorksetMapFilterCompany(id),
          kind: MapFilterChipKind.company,
        ),
      );
    }

    final seenSource = <String>{};
    for (final s in workset.sources) {
      if (!seenSource.add(s.id)) continue;
      final name = s.displayName.trim();
      if (name.isEmpty) continue;
      chips.add(
        MapFilterChipSpec(
          label: name,
          filter: WorksetMapFilterSource(s.id),
          kind: MapFilterChipKind.source,
        ),
      );
    }

    if (workset.sources.any((s) => s.isManual)) {
      chips.add(
        const MapFilterChipSpec(
          label: '수동',
          filter: WorksetMapFilterManual(),
          kind: MapFilterChipKind.manual,
        ),
      );
    }
    return List<MapFilterChipSpec>.unmodifiable(chips);
  }
}
