import '../models/me_response.dart';

/// Safe account chrome. Never include UUID / person / driver / token fields.
class MenuAccountView {
  const MenuAccountView({
    required this.displayName,
    required this.roleLabel,
  });

  final String displayName;
  final String roleLabel;
}

MenuAccountView menuAccountView(MeResponse? me) {
  final raw = me?.displayName?.trim();
  final displayName = (raw != null && raw.isNotEmpty) ? raw : '기사';
  final roleLabel = me?.isDriver == true ? '배송 기사' : '계정';
  return MenuAccountView(displayName: displayName, roleLabel: roleLabel);
}
