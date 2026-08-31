/// In-memory map filter identity — never use displayName alone.
sealed class WorksetMapFilter {
  const WorksetMapFilter();

  static const all = WorksetMapFilterAll();

  String get debugId;
}

final class WorksetMapFilterAll extends WorksetMapFilter {
  const WorksetMapFilterAll();

  @override
  String get debugId => 'all';

  @override
  bool operator ==(Object other) => other is WorksetMapFilterAll;

  @override
  int get hashCode => 0;
}

/// [companyId] null = company-less / personal jobs.
final class WorksetMapFilterCompany extends WorksetMapFilter {
  const WorksetMapFilterCompany(this.companyId);

  final String? companyId;

  @override
  String get debugId => 'company:${companyId ?? 'null'}';

  @override
  bool operator ==(Object other) =>
      other is WorksetMapFilterCompany && other.companyId == companyId;

  @override
  int get hashCode => companyId.hashCode;
}

final class WorksetMapFilterSource extends WorksetMapFilter {
  const WorksetMapFilterSource(this.sourceId);

  final String sourceId;

  @override
  String get debugId => 'source:$sourceId';

  @override
  bool operator ==(Object other) =>
      other is WorksetMapFilterSource && other.sourceId == sourceId;

  @override
  int get hashCode => sourceId.hashCode;
}

/// Manual / driver_manual sources (may span multiple sourceIds).
final class WorksetMapFilterManual extends WorksetMapFilter {
  const WorksetMapFilterManual();

  @override
  String get debugId => 'manual';

  @override
  bool operator ==(Object other) => other is WorksetMapFilterManual;

  @override
  int get hashCode => 1;
}
