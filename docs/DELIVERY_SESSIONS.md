# Delivery Sessions & Route Recording (Phase B)

## Lifecycle

```
start (idempotent)
  → status=active, started_at=server now
  → DeliveryRouteRecorder starts (app/session scope, not MapSpikeScreen)

end
  → stop accepting new GPS
  → status=ending + ended_at=server now
  → flush local buffer where recorded_at <= ended_at
  → POST finalize → status=completed
```

## Sampling defaults (`RouteSamplingConfig`)

| Param | Value | Why |
|-------|-------|-----|
| minDistanceMeters | 25 | alley turns without oversampling |
| minInterval | 15s | OR with distance |
| maxHeartbeat | 90s | fill long gaps |
| maxAccuracyMeters | 35 | drop poor fixes |
| maxImpliedSpeedMps | 35 | drop GPS jumps |
| stopPauseAfter | 5m | suppress stop drift |

Marker updates remain independent (5m / 10° / 3s Geolocator).

## Local buffer privacy

- App sandbox (`getApplicationSupportDirectory`) only
- Session + driver folder isolation
- ACK → immediate delete from buffer
- No SharedPreferences for GPS
- No coordinate logging
- Encryption-at-rest: production TODO (see `route_privacy_todo.dart`)

## Retention (product default, NOT legal final)

- Route points: 30 days (`purge_expired_delivery_route_points`)
- Session metadata: 90 days (`purge_expired_delivery_session_metadata`)
