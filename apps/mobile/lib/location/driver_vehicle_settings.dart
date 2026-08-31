import 'package:shared_preferences/shared_preferences.dart';

import 'driver_vehicle_type.dart';

/// Persists the driver's vehicle icon choice for map GPS marker.
class DriverVehicleSettings {
  DriverVehicleSettings._();

  static const _prefsKey = 'driver.vehicle_type';
  static const DriverVehicleType defaultVehicle = DriverVehicleType.truck;

  static Future<DriverVehicleType> load() async {
    final prefs = await SharedPreferences.getInstance();
    return DriverVehicleType.tryParse(prefs.getString(_prefsKey)) ??
        defaultVehicle;
  }

  static Future<void> save(DriverVehicleType type) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_prefsKey, type.name);
  }
}
