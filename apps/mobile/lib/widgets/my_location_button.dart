import 'package:flutter/material.dart';

/// Map overlay: re-center on driver GPS and enable follow mode.
class MyLocationButton extends StatelessWidget {
  const MyLocationButton({
    super.key,
    required this.onPressed,
    required this.followActive,
    this.enabled = true,
  });

  final VoidCallback? onPressed;
  final bool followActive;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Material(
      elevation: 4,
      borderRadius: BorderRadius.circular(12),
      color: colorScheme.surface.withValues(alpha: 0.95),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: enabled ? onPressed : null,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Icon(
            followActive ? Icons.my_location : Icons.location_searching,
            color: enabled
                ? (followActive
                    ? colorScheme.primary
                    : colorScheme.onSurface)
                : colorScheme.onSurface.withValues(alpha: 0.38),
          ),
        ),
      ),
    );
  }
}
