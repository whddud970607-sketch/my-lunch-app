import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Six-digit verification code input for identity verification flows.
class VerificationCodeInput extends StatefulWidget {
  const VerificationCodeInput({
    super.key,
    required this.onChanged,
    this.length = 6,
    this.enabled = true,
  });

  final ValueChanged<String> onChanged;
  final int length;
  final bool enabled;

  @override
  State<VerificationCodeInput> createState() => VerificationCodeInputState();
}

class VerificationCodeInputState extends State<VerificationCodeInput> {
  late final List<TextEditingController> _cells;
  late final List<FocusNode> _focusNodes;

  @override
  void initState() {
    super.initState();
    _cells = List.generate(widget.length, (_) => TextEditingController());
    _focusNodes = List.generate(widget.length, (_) => FocusNode());
  }

  @override
  void dispose() {
    for (final c in _cells) {
      c.dispose();
    }
    for (final f in _focusNodes) {
      f.dispose();
    }
    super.dispose();
  }

  String get value => _cells.map((c) => c.text).join();

  void clear() {
    for (final c in _cells) {
      c.clear();
    }
    for (final f in _focusNodes) {
      f.unfocus();
    }
    widget.onChanged('');
  }

  void _notify() => widget.onChanged(value);

  void _onCellChanged(int index, String raw) {
    final digit = raw.replaceAll(RegExp(r'\D'), '');
    if (digit.length > 1) {
      _fillFromPaste(index, digit);
      return;
    }
    _cells[index].text = digit;
    _cells[index].selection = TextSelection.collapsed(offset: digit.length);
    _notify();
    if (digit.isNotEmpty && index < widget.length - 1) {
      _focusNodes[index + 1].requestFocus();
    }
  }

  void _fillFromPaste(int startIndex, String digits) {
    var i = startIndex;
    for (var j = 0; j < digits.length && i < widget.length; j++) {
      final ch = digits[j];
      if (!RegExp(r'\d').hasMatch(ch)) continue;
      _cells[i].text = ch;
      i += 1;
    }
    _notify();
    if (i < widget.length) {
      _focusNodes[i].requestFocus();
    } else {
      _focusNodes[widget.length - 1].unfocus();
    }
  }

  KeyEventResult _onKeyEvent(int index, KeyEvent event) {
    if (event is! KeyDownEvent) return KeyEventResult.ignored;
    if (event.logicalKey == LogicalKeyboardKey.backspace &&
        _cells[index].text.isEmpty &&
        index > 0) {
      _focusNodes[index - 1].requestFocus();
      return KeyEventResult.handled;
    }
    return KeyEventResult.ignored;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: List.generate(widget.length, (index) {
        return SizedBox(
          width: 44,
          child: Focus(
            onKeyEvent: (_, event) => _onKeyEvent(index, event),
            child: TextField(
              controller: _cells[index],
              focusNode: _focusNodes[index],
              enabled: widget.enabled,
              textAlign: TextAlign.center,
              keyboardType: TextInputType.number,
              maxLength: 1,
              style: theme.textTheme.titleLarge,
              autofillHints: const [],
              enableSuggestions: false,
              autocorrect: false,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              decoration: InputDecoration(
                counterText: '',
                contentPadding: const EdgeInsets.symmetric(vertical: 12),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
              ),
              onChanged: (v) => _onCellChanged(index, v),
            ),
          ),
        );
      }),
    );
  }
}

String maskPhoneForDisplay(String phone) {
  final digits = phone.replaceAll(RegExp(r'\D'), '');
  if (digits.length < 4) return '****';
  final last4 = digits.substring(digits.length - 4);
  if (digits.startsWith('010') && digits.length >= 11) {
    return '010-****-$last4';
  }
  return '***-****-$last4';
}
