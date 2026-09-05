import 'package:flutter_test/flutter_test.dart';

import 'package:delivery_shield_mobile/map/delivery_location_pin.dart';
import 'package:delivery_shield_mobile/map/today_workset_map_adapter.dart';
import 'package:delivery_shield_mobile/map/workset_completion_reconciler.dart';
import 'package:delivery_shield_mobile/map/workset_map_filter.dart';
import 'package:delivery_shield_mobile/models/map_spike_point.dart';
import 'package:delivery_shield_mobile/models/shipment_namespace_key.dart';
import 'package:delivery_shield_mobile/models/today_workset.dart';
import 'package:delivery_shield_mobile/sync/completion_projection_store.dart';

Map<String, dynamic> _sampleTodayJson() {
  return {
    'serviceDate': '2026-08-27',
    'summary': {
      'totalPoints': 3,
      'completedPoints': 1,
      'pendingPoints': 2,
      'totalShipments': 3,
      'byCompany': [
        {'companyId': 'co-a', 'totalPoints': 1, 'completedPoints': 0},
        {'companyId': 'co-b', 'totalPoints': 1, 'completedPoints': 1},
        {'companyId': null, 'totalPoints': 1, 'completedPoints': 0},
      ],
      'bySource': [
        {'sourceId': 'src-a', 'totalPoints': 1, 'completedPoints': 0},
        {'sourceId': 'src-b', 'totalPoints': 1, 'completedPoints': 1},
        {'sourceId': 'src-m', 'totalPoints': 1, 'completedPoints': 0},
      ],
    },
    'companies': [
      {'id': 'co-a', 'displayName': 'Alpha'},
      {'id': 'co-b', 'displayName': 'Alpha'}, // same label, different id
    ],
    'sources': [
      {
        'id': 'src-a',
        'companyId': 'co-a',
        'ownerDriverId': null,
        'sourceType': 'company_api',
        'sourceKey': 'a',
        'displayName': 'SameName',
        'externalSystem': null,
        'isActive': true,
      },
      {
        'id': 'src-b',
        'companyId': 'co-b',
        'ownerDriverId': null,
        'sourceType': 'excel_import',
        'sourceKey': 'b',
        'displayName': 'SameName',
        'externalSystem': null,
        'isActive': true,
      },
      {
        'id': 'src-m',
        'companyId': null,
        'ownerDriverId': 'driver-1',
        'sourceType': 'driver_manual',
        'sourceKey': 'manual',
        'displayName': '직접추가',
        'externalSystem': null,
        'isActive': true,
      },
    ],
    'jobs': [
      {
        'id': 'job-a',
        'companyId': 'co-a',
        'sourceId': 'src-a',
        'status': 'active',
        'serviceDate': '2026-08-27',
      },
      {
        'id': 'job-b',
        'companyId': 'co-b',
        'sourceId': 'src-b',
        'status': 'active',
        'serviceDate': '2026-08-27',
      },
      {
        'id': 'job-m',
        'companyId': null,
        'sourceId': 'src-m',
        'status': 'active',
        'serviceDate': '2026-08-27',
      },
    ],
    'points': [
      {
        'pointId': 'pt-a',
        'jobId': 'job-a',
        'companyId': 'co-a',
        'sourceId': 'src-a',
        'status': 'pending',
        'latitude': 37.427583,
        'longitude': 126.748783,
        'quantity': 2,
        'displayLabel': 'A box',
        'pinAccuracy': 'building',
        'piiMasked': false,
        'hasAccessInfo': true,
        'shipmentCount': 1,
        'contactAvailable': true,
      },
      {
        'pointId': 'pt-b',
        'jobId': 'job-b',
        'companyId': 'co-b',
        'sourceId': 'src-b',
        'status': 'completed',
        'latitude': 37.427583,
        'longitude': 126.748783,
        'quantity': 1,
        'displayLabel': 'B box',
        'pinAccuracy': 'building',
        'piiMasked': true,
        'hasAccessInfo': false,
        'shipmentCount': 1,
        'contactAvailable': false,
      },
      {
        'pointId': 'pt-m',
        'jobId': 'job-m',
        'companyId': null,
        'sourceId': 'src-m',
        'status': 'pending',
        'latitude': 37.5,
        'longitude': 126.9,
        'quantity': 1,
        'displayLabel': 'Manual',
        'pinAccuracy': 'address',
        'piiMasked': false,
        'hasAccessInfo': false,
        'shipmentCount': 1,
        'contactAvailable': false,
      },
    ],
    'shipments': [
      {
        'id': 'sh-a',
        'pointId': 'pt-a',
        'jobId': 'job-a',
        'sourceId': 'src-a',
        'externalId': 'ext-a',
        'sequenceNo': 1,
        'trackingCode': '12345',
        'status': 'pending',
      },
      {
        'id': 'sh-b',
        'pointId': 'pt-b',
        'jobId': 'job-b',
        'sourceId': 'src-b',
        'externalId': null,
        'sequenceNo': 1,
        'trackingCode': '12345',
        'status': 'completed',
      },
      {
        'id': 'sh-m',
        'pointId': 'pt-m',
        'jobId': 'job-m',
        'sourceId': 'src-m',
        'externalId': null,
        'sequenceNo': 1,
        'trackingCode': 'M-1',
        'status': 'pending',
      },
    ],
  };
}

void main() {
  group('TodayWorkset parse', () {
    test('parses companies + capabilities without PII/secrets', () {
      final ws = TodayWorkset.fromJson(_sampleTodayJson());
      expect(ws.companies.length, 2);
      expect(ws.companyById('co-a')?.displayName, 'Alpha');
      expect(ws.companyById('co-b')?.displayName, 'Alpha');
      expect(ws.companies.map((c) => c.id).toSet().length, 2);

      final a = ws.points.firstWhere((p) => p.pointId == 'pt-a');
      expect(a.hasAccessInfo, isTrue);
      expect(a.contactAvailable, isTrue);
      expect(a.shipmentCount, 1);
      expect(ws.points.any((p) => p.companyId == null), isTrue);

      final blob = ws.toString();
      expect(blob.contains('010'), isFalse);

      final empty = TodayWorkset.fromJson({
        'serviceDate': '2026-08-30',
        'summary': {
          'totalPoints': 0,
          'completedPoints': 0,
          'pendingPoints': 0,
          'totalShipments': 0,
          'byCompany': [],
          'bySource': [],
        },
        'companies': [],
        'sources': [],
        'jobs': [],
        'points': [],
        'shipments': [],
      });
      expect(empty.isEmpty, isTrue);
    });

    test('adapter uses company/source labels and hasAccessInfo from Today', () {
      final ws = TodayWorkset.fromJson(_sampleTodayJson());
      final points =
          TodayWorksetMapAdapter.toMapPoints(ws, driverId: 'driver-1');
      final a = points.firstWhere((p) => p.pointId == 'pt-a');
      expect(a.companyLabel, 'Alpha');
      expect(a.sourceLabel, 'SameName');
      expect(a.hasAccessInfo, isTrue);
      expect(a.customerName, isEmpty);
      expect(a.address, isEmpty);
      expect(a.contactValue, isNull);
    });
  });

  group('filters', () {
    late TodayWorkset ws;
    late List<MapSpikePoint> points;

    setUp(() {
      ws = TodayWorkset.fromJson(_sampleTodayJson());
      points = TodayWorksetMapAdapter.toMapPoints(ws, driverId: 'driver-1');
    });

    test('ALL / company / source / manual by identity', () {
      expect(
        TodayWorksetMapAdapter.applyFilter(
          points,
          WorksetMapFilter.all,
          workset: ws,
        ).length,
        3,
      );
      expect(
        TodayWorksetMapAdapter.applyFilter(
          points,
          const WorksetMapFilterCompany('co-a'),
          workset: ws,
        ).single.pointId,
        'pt-a',
      );
      expect(
        TodayWorksetMapAdapter.applyFilter(
          points,
          const WorksetMapFilterCompany('co-b'),
          workset: ws,
        ).single.pointId,
        'pt-b',
      );
      expect(
        TodayWorksetMapAdapter.applyFilter(
          points,
          const WorksetMapFilterSource('src-a'),
          workset: ws,
        ).single.sourceId,
        'src-a',
      );
      expect(
        TodayWorksetMapAdapter.applyFilter(
          points,
          const WorksetMapFilterManual(),
          workset: ws,
        ).single.pointId,
        'pt-m',
      );
    });

    test('valid manual point is not dropped from markers', () {
      expect(points.any((p) => p.pointId == 'pt-m'), isTrue);
      final dropped = TodayWorkset.fromJson({
        ..._sampleTodayJson(),
        'points': [
          {
            'pointId': 'pt-m-no-coord',
            'jobId': 'job-m',
            'companyId': null,
            'sourceId': 'src-m',
            'status': 'pending',
            'latitude': null,
            'longitude': null,
            'quantity': 1,
            'displayLabel': 'Manual',
            'pinAccuracy': 'address',
            'piiMasked': false,
            'hasAccessInfo': false,
            'shipmentCount': 1,
            'contactAvailable': false,
          },
        ],
      });
      expect(
        TodayWorksetMapAdapter.toMapPoints(dropped, driverId: 'driver-1'),
        isEmpty,
      );
    });
  });

  group('same-location', () {
    test('A+B keep company labels after aggregation', () {
      final ws = TodayWorkset.fromJson(_sampleTodayJson());
      final points =
          TodayWorksetMapAdapter.toMapPoints(ws, driverId: 'driver-1');
      final clustered =
          groupPointsByLocation(points).firstWhere((p) => p.isCluster);
      expect(clustered.points.map((p) => p.companyLabel).toSet(), {'Alpha'});
      expect(clustered.points.map((p) => p.companyId).toSet(), {'co-a', 'co-b'});
      expect(clustered.points.map((p) => p.sourceId).toSet(), {'src-a', 'src-b'});
    });
  });

  group('shipment namespace', () {
    test('same trackingCode different sources are distinct keys', () {
      final ws = TodayWorkset.fromJson(_sampleTodayJson());
      final byKey = <ShipmentNamespaceKey, WorksetShipment>{};
      for (final s in ws.shipments) {
        byKey[s.namespaceKey] = s;
      }
      expect(byKey.length, 3);
    });
  });

  group('completion reconcile', () {
    test('keeps optimistic completed while sync pending', () {
      final store = CompletionProjectionStore();
      store.markPending('pt-a');
      final server = MapSpikePoint(
        geocodeProvider: 'kakao',
        pinAccuracy: 'building',
        latitude: 1,
        longitude: 1,
        carrier: '',
        customerName: '',
        address: '',
        detailAddress: '',
        product: 'open',
        quantity: 1,
        status: '대기',
        statusCode: 'pending',
        pointId: 'pt-a',
        jobId: 'j',
        driverId: 'd',
        piiMasked: false,
      );
      final local = server.copyWith(
        statusCode: 'completed',
        status: '배송 완료',
        piiMasked: true,
      );
      final merged = WorksetCompletionReconciler.mergePoint(
        server: server,
        local: local,
        projection: store.forPoint('pt-a'),
      );
      expect(merged.isCompleted, isTrue);
    });
  });

  group('performance smoke', () {
    test('300-point parse/filter/group', () {
      final pointsJson = <Map<String, dynamic>>[];
      final shipmentsJson = <Map<String, dynamic>>[];
      for (var i = 0; i < 300; i++) {
        final company = i % 2 == 0 ? 'co-a' : 'co-b';
        final source = i % 2 == 0 ? 'src-a' : 'src-b';
        pointsJson.add({
          'pointId': 'pt-$i',
          'jobId': 'job-$company',
          'companyId': company,
          'sourceId': source,
          'status': i % 5 == 0 ? 'completed' : 'pending',
          'latitude': 37.0 + (i % 50) * 0.001,
          'longitude': 126.0 + (i % 50) * 0.001,
          'quantity': 1 + (i % 3),
          'displayLabel': 'P$i',
          'pinAccuracy': 'building',
          'piiMasked': i % 5 == 0,
          'hasAccessInfo': i % 7 == 0,
          'shipmentCount': 1,
          'contactAvailable': i % 11 == 0,
        });
        shipmentsJson.add({
          'id': 'sh-$i',
          'pointId': 'pt-$i',
          'jobId': 'job-$company',
          'sourceId': source,
          'externalId': null,
          'sequenceNo': 1,
          'trackingCode': 'T-$i',
          'status': 'pending',
        });
      }
      final json = {
        'serviceDate': '2026-08-27',
        'summary': {
          'totalPoints': 300,
          'completedPoints': 60,
          'pendingPoints': 240,
          'totalShipments': 300,
          'byCompany': [],
          'bySource': [],
        },
        'companies': [
          {'id': 'co-a', 'displayName': 'A'},
          {'id': 'co-b', 'displayName': 'B'},
        ],
        'sources': [
          {
            'id': 'src-a',
            'companyId': 'co-a',
            'ownerDriverId': null,
            'sourceType': 'company_api',
            'sourceKey': 'a',
            'displayName': 'A',
            'externalSystem': null,
            'isActive': true,
          },
          {
            'id': 'src-b',
            'companyId': 'co-b',
            'ownerDriverId': null,
            'sourceType': 'company_api',
            'sourceKey': 'b',
            'displayName': 'B',
            'externalSystem': null,
            'isActive': true,
          },
        ],
        'jobs': [
          {
            'id': 'job-co-a',
            'companyId': 'co-a',
            'sourceId': 'src-a',
            'status': 'active',
            'serviceDate': '2026-08-27',
          },
          {
            'id': 'job-co-b',
            'companyId': 'co-b',
            'sourceId': 'src-b',
            'status': 'active',
            'serviceDate': '2026-08-27',
          },
        ],
        'points': pointsJson,
        'shipments': shipmentsJson,
      };

      final sw = Stopwatch()..start();
      final ws = TodayWorkset.fromJson(json);
      final mapped =
          TodayWorksetMapAdapter.toMapPoints(ws, driverId: 'driver-1');
      final filtered = TodayWorksetMapAdapter.applyFilter(
        mapped,
        const WorksetMapFilterCompany('co-a'),
        workset: ws,
      );
      final pins = groupPointsByLocation(filtered);
      expect(mapped.length, 300);
      expect(filtered.length, 150);
      expect(pins.isNotEmpty, isTrue);
      expect(sw.elapsedMilliseconds, lessThan(2000));
    });
  });
}
