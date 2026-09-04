import 'package:flutter/material.dart';

abstract final class LogoutKeys {
  static const dialog = Key('logout_confirm');
  static const title = Key('logout_title');
  static const cancel = Key('logout_cancel');
  static const confirm = Key('logout_confirm_action');
}
