/**
 * Research-only BUILDING_CENTER verification gate for TRACK A.
 * Only CUSTOM_INTERIOR_POINT with containment=true may verify BUILDING_CENTER.
 * Centroid-outside or centroid-only paths never verify.
 */

import { computeRepresentativePoints, fmtCoord } from "./representative-geometry.mjs";

export function assessBuildingCenterGate(geometry) {
  const rep = computeRepresentativePoints(geometry);
  if (!rep) {
    return {
      verified: false,
      terminal: "GEOMETRY_UNRESOLVED",
      failureReason: "REPRESENTATIVE_POINT_FAILED",
      selectedMethod: "NONE",
      pinProvenance: null,
      interiorPointMethod: null,
      interiorPointInside: false,
      centroidInside: false,
      buildingCenter: null,
    };
  }

  const interiorInside =
    rep.interior?.method === "CUSTOM_INTERIOR_POINT" && rep.interiorInside === true;

  if (interiorInside && rep.interior.point) {
    const [lng, lat] = rep.interior.point;
    return {
      verified: true,
      terminal: "BUILDING_CENTER_VERIFIED",
      failureReason: null,
      selectedMethod: "CUSTOM_INTERIOR_POINT",
      pinProvenance: "BUILDING_CENTER",
      interiorPointMethod: rep.interior.method,
      interiorPointStrategy: rep.interior.strategy,
      interiorPointInside: true,
      centroidInside: rep.centroidInside === true,
      buildingCenter: {
        lat: fmtCoord(lat),
        lng: fmtCoord(lng),
        coordinateOrder: rep.coordinateOrder,
      },
    };
  }

  return {
    verified: false,
    terminal: "GEOMETRY_UNRESOLVED",
    failureReason:
      rep.centroidInside && !interiorInside
        ? "CENTROID_ONLY_NOT_ALLOWED"
        : "INTERIOR_POINT_NOT_INSIDE",
    selectedMethod: "NONE",
    pinProvenance: null,
    interiorPointMethod: rep.interior?.method ?? null,
    interiorPointInside: rep.interiorInside === true,
    centroidInside: rep.centroidInside === true,
    buildingCenter: null,
  };
}
