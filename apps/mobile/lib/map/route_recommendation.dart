/// Architecture notes for future "AI 경로추천" (design only — not wired to UI yet).
///
/// Goals (from product):
/// - Toggle ON/OFF must be instant; do not rebuild KakaoMap widget.
/// - OFF: keep original delivery sequence; never mutate order as side effect of map.
/// - ON: compute recommended order for **remaining (incomplete)** stops using
///   real road travel time/distance (not crow-flight), optionally traffic.
/// - On failure: keep previous/original order safely.
/// - Pin can later show [routeOrder] + [totalQuantity] via [DeliveryLocationPin].
///
/// Recommended pipeline:
/// 1. Mobile: ValueNotifier for aiRouteEnabled + RouteComputeState
///    (`idle` | `computing` | `ready` | `failed`). Toggle flips flag immediately.
/// 2. Mobile sends async request to Nest `POST /v1/delivery/route-recommend`
///    with driver JWT (RLS), current lat/lng, list of incomplete point ids.
/// 3. Nest calls a RoutingProvider (Kakao Mobility / TMAP / Naver) server-side
///    using REST key — never embed routing keys in the Flutter app.
/// 4. Response: ordered pointIds + optional polyline + ETA per leg.
/// 5. Mobile applies order to list UI + `routeOrderByPointId` when rebuilding
///    pin styles only (registerMarkerStyles / addMarkers), not full map recreate.
///
/// Provider choice is deferred until keys/terms are approved (see session report).
library;

enum RouteComputeState { idle, computing, ready, failed }

/// Placeholder contract — implement only after an approved commercial routing API.
abstract class RouteRecommendClient {
  Future<List<String>> recommendOrder({
    required double originLat,
    required double originLng,
    required List<String> incompletePointIds,
  });
}
