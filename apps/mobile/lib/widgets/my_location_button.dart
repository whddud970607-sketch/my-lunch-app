import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import '../theme/app_radius.dart';
import '../theme/app_spacing.dart';

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
    return Semantics(
      label: followActive ? 'follow_on' : 'follow_off',
      button: true,
      enabled: enabled,
      child: Material(
        elevation: 4,
        borderRadius: BorderRadius.circular(AppRadius.md),
        color: AppColors.surfaceElevated,
        child: InkWell(
          borderRadius: BorderRadius.circular(AppRadius.md),
          onTap: enabled ? onPressed : null,
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.md),
            child: Icon(
              followActive ? Icons.my_location : Icons.location_searching,
              color: enabled
                  ? (followActive ? AppColors.primary : AppColors.textPrimary)
                  : AppColors.textSecondary,
            ),
          ),
        ),
      ),
    );
  }
}
