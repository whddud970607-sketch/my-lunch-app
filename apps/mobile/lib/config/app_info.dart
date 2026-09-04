/// User-facing app identity. Values must match `pubspec.yaml` `version`.
/// Never invent a marketing version independently of the package.
abstract final class AppInfo {
  static const versionName = '0.1.0';
  static const buildNumber = '1';

  static String get userFacingVersion => '버전 $versionName';
}
