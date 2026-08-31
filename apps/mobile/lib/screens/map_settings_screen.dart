import 'package:flutter/material.dart';

import '../location/driver_vehicle_settings.dart';
import '../location/driver_vehicle_type.dart';
import '../map/map_provider_id.dart';
import '../map/map_provider_settings.dart';
import '../map/naver_map_feature.dart';

/// Driver settings: choose Kakao vs Naver map SDK.
class MapSettingsScreen extends StatefulWidget {
  const MapSettingsScreen({super.key});

  @override
  State<MapSettingsScreen> createState() => _MapSettingsScreenState();
}

class _MapSettingsScreenState extends State<MapSettingsScreen> {
  MapProviderId _selected = MapProviderSettings.defaultProvider;
  DriverVehicleType _vehicle = DriverVehicleSettings.defaultVehicle;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final results = await Future.wait([
      MapProviderSettings.load(),
      DriverVehicleSettings.load(),
    ]);
    if (!mounted) return;
    setState(() {
      _selected = results[0] as MapProviderId;
      _vehicle = results[1] as DriverVehicleType;
      _loading = false;
    });
  }

  Future<void> _onSelect(MapProviderId id) async {
    await MapProviderSettings.save(id);
    if (!mounted) return;
    setState(() => _selected = id);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('${id.displayLabel} 저장됨 · 배송 지도에 반영됩니다'),
      ),
    );
  }

  Future<void> _onSelectVehicle(DriverVehicleType type) async {
    await DriverVehicleSettings.save(type);
    if (!mounted) return;
    setState(() => _vehicle = type);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('${type.displayLabel} 아이콘 저장됨 · 지도에 반영됩니다')),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('지도 설정')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              children: [
                const ListTile(
                  title: Text('지도 제공자'),
                  subtitle: Text('배송 지도에 사용할 지도를 선택합니다'),
                ),
                ListTile(
                  title: Text(MapProviderId.kakao.displayLabel),
                  subtitle: const Text('기본 · 현재 정상 동작 경로'),
                  leading: Icon(
                    _selected == MapProviderId.kakao
                        ? Icons.radio_button_checked
                        : Icons.radio_button_off,
                  ),
                  selected: _selected == MapProviderId.kakao,
                  onTap: () => _onSelect(MapProviderId.kakao),
                ),
                ListTile(
                  title: Text(MapProviderId.naver.displayLabel),
                  subtitle: Text(
                    NaverMapFeature.isConfigured
                        ? (NaverMapFeature.isReady
                            ? 'Client ID 준비됨'
                            : 'Client ID 있음 · 초기화 확인 필요')
                        : 'Client ID 미설정 · 선택 가능하나 지도는 안내 화면',
                  ),
                  leading: Icon(
                    _selected == MapProviderId.naver
                        ? Icons.radio_button_checked
                        : Icons.radio_button_off,
                  ),
                  selected: _selected == MapProviderId.naver,
                  onTap: () => _onSelect(MapProviderId.naver),
                ),
                const Divider(),
                const ListTile(
                  title: Text('운송수단 아이콘'),
                  subtitle: Text('내 위치 마커에 표시할 차량 아이콘'),
                ),
                ListTile(
                  title: Text(DriverVehicleType.truck.displayLabel),
                  subtitle: const Text('기본 · 화물 배송'),
                  leading: Icon(
                    _vehicle == DriverVehicleType.truck
                        ? Icons.radio_button_checked
                        : Icons.radio_button_off,
                  ),
                  selected: _vehicle == DriverVehicleType.truck,
                  onTap: () => _onSelectVehicle(DriverVehicleType.truck),
                ),
                ListTile(
                  title: Text(DriverVehicleType.motorcycle.displayLabel),
                  subtitle: const Text('이륜 배송'),
                  leading: Icon(
                    _vehicle == DriverVehicleType.motorcycle
                        ? Icons.radio_button_checked
                        : Icons.radio_button_off,
                  ),
                  selected: _vehicle == DriverVehicleType.motorcycle,
                  onTap: () => _onSelectVehicle(DriverVehicleType.motorcycle),
                ),
                const Divider(),
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Text(
                    '선택값은 기기에 저장되며 앱을 다시 실행해도 유지됩니다.\n'
                    '배송 데이터·완료·사진은 지도 제공자와 무관합니다.\n'
                    'NCP 등록: Android com.deliveryshield.delivery_shield_mobile / '
                    'iOS com.deliveryshield.deliveryShieldMobile',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ),
              ],
            ),
    );
  }
}
