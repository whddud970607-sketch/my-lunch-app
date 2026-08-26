/// Permission wiring stubs for later phases.
/// Phase 1D: do NOT request camera/location at runtime.
enum AppPermission { camera, location }

class PermissionStatusStub {
  const PermissionStatusStub({
    required this.permission,
    required this.prepared,
    this.requested = false,
  });

  final AppPermission permission;
  final bool prepared;
  final bool requested;
}

class PermissionsStub {
  /// Declares intent to use permissions later (scan / map).
  /// Does not call OS permission APIs.
  Future<PermissionStatusStub> prepare(AppPermission permission) async {
    return PermissionStatusStub(permission: permission, prepared: true);
  }

  /// Placeholder for future OS request — intentionally no-op.
  Future<PermissionStatusStub> requestLater(AppPermission permission) async {
    return PermissionStatusStub(
      permission: permission,
      prepared: true,
      requested: false,
    );
  }
}
