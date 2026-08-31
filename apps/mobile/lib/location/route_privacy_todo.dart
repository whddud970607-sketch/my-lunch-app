/// Production privacy / legal TODO for delivery route GPS data.
///
/// Product defaults (NOT legally finalized):
/// - route points retention: 30 days
/// - session metadata/summary: 90 days
///
/// Before production:
/// - [ ] Domestic PIPA / location-info law review
/// - [ ] Collection & use consent UI
/// - [ ] Privacy policy / location service notice
/// - [ ] Retention period disclosure
/// - [ ] Account deletion cascade for sessions + route points
/// - [ ] Company-admin route access policy (default deny full route)
/// - [ ] Encryption-at-rest for LocalRouteBuffer (no weak custom crypto)
library;
