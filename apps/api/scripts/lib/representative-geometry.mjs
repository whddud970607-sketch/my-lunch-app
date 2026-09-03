/**
 * Research-only representative geometry helpers for Delivery Shield gates.
 * Not production wiring. No external geometry dependency.
 *
 * INTERIOR_POINT_METHOD is CUSTOM_INTERIOR_POINT — not PostGIS ST_PointOnSurface.
 */

const EPS = 1e-12;

function ringSignedAreaAndCentroid(ring) {
  if (!ring?.length || ring.length < 4) return null;
  let twiceArea = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x0, y0] = ring[j];
    const [x1, y1] = ring[i];
    const cross = x0 * y1 - x1 * y0;
    twiceArea += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  if (Math.abs(twiceArea) < EPS) return null;
  return {
    area: twiceArea / 2,
    centroid: [cx / (3 * twiceArea), cy / (3 * twiceArea)],
  };
}

/** Orientation-independent polygon centroid with holes (GeoJSON ring order). */
export function polygonCentroidWithHoles(rings) {
  if (!rings?.length) return null;
  let totalArea = 0;
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < rings.length; i++) {
    const ring = ringSignedAreaAndCentroid(rings[i]);
    if (!ring) continue;
    const absArea = Math.abs(ring.area);
    const sign = i === 0 ? 1 : -1;
    const contribution = sign * absArea;
    totalArea += contribution;
    sumX += ring.centroid[0] * contribution;
    sumY += ring.centroid[1] * contribution;
  }
  if (Math.abs(totalArea) < EPS) return null;
  return [sumX / totalArea, sumY / totalArea];
}

export function pointInRing(point, ring) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi + 0.0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function pointInPolygonWithHoles(point, rings) {
  if (!rings?.length) return false;
  if (!pointInRing(point, rings[0])) return false;
  for (let i = 1; i < rings.length; i++) {
    if (pointInRing(point, rings[i])) return false;
  }
  return true;
}

export function pointInMultiPolygon(point, multiCoords) {
  for (const poly of multiCoords) {
    if (pointInPolygonWithHoles(point, poly)) return true;
  }
  return false;
}

function bboxOfRings(rings) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (const [x, y] of ring) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return { minX, minY, maxX, maxY };
}

function xIntersectionsAtY(ring, y) {
  const xs = [];
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[j];
    const [x2, y2] = ring[i];
    if (y1 === y2) continue;
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    if (y < minY || y >= maxY) continue;
    const t = (y - y1) / (y2 - y1);
    xs.push(x1 + t * (x2 - x1));
  }
  xs.sort((a, b) => a - b);
  return xs;
}

function interiorSegmentsAtY(rings, y) {
  const outers = xIntersectionsAtY(rings[0], y);
  const segments = [];
  for (let i = 0; i + 1 < outers.length; i += 2) {
    let x1 = outers[i];
    let x2 = outers[i + 1];
    for (let h = 1; h < rings.length; h++) {
      const hx = xIntersectionsAtY(rings[h], y);
      const cuts = hx.filter((v) => v > x1 && v < x2).sort((a, b) => a - b);
      if (cuts.length === 0) continue;
      const parts = [];
      let cur = x1;
      for (const cut of cuts) {
        parts.push([cur, cut]);
        cur = cut;
      }
      parts.push([cur, x2]);
      const kept = parts.filter(([a, b]) =>
        pointInPolygonWithHoles([(a + b) / 2, y], rings),
      );
      if (kept.length) {
        kept.sort((a, b) => b[1] - b[0] - (a[1] - a[0]));
        x1 = kept[0][0];
        x2 = kept[0][1];
      }
    }
    if (x2 > x1) segments.push([x1, x2]);
  }
  return segments;
}

function polygonAbsArea(rings) {
  const outer = ringSignedAreaAndCentroid(rings[0] ?? []);
  if (!outer) return 0;
  let area = Math.abs(outer.area);
  for (let i = 1; i < rings.length; i++) {
    const hole = ringSignedAreaAndCentroid(rings[i]);
    if (hole) area -= Math.abs(hole.area);
  }
  return Math.max(area, 0);
}

/**
 * Guaranteed-interior research point. Not equivalent to PostGIS ST_PointOnSurface.
 */
export function customInteriorPointPolygon(rings) {
  const centroid = polygonCentroidWithHoles(rings);
  if (centroid && pointInPolygonWithHoles(centroid, rings)) {
    return {
      point: centroid,
      method: "CUSTOM_INTERIOR_POINT",
      strategy: "centroid_when_interior",
    };
  }

  const bb = bboxOfRings(rings);
  const steps = 128;
  let best = null;
  let bestLen = -1;
  for (let si = 0; si < steps; si++) {
    const y = bb.minY + ((bb.maxY - bb.minY) * (si + 0.5)) / steps;
    const segs = interiorSegmentsAtY(rings, y);
    for (const [x1, x2] of segs) {
      const len = x2 - x1;
      if (len > bestLen) {
        const mid = [(x1 + x2) / 2, y];
        if (pointInPolygonWithHoles(mid, rings)) {
          bestLen = len;
          best = mid;
        }
      }
    }
  }
  if (best) {
    return {
      point: best,
      method: "CUSTOM_INTERIOR_POINT",
      strategy: "horizontal_scan_midpoint",
    };
  }

  for (let gy = 0; gy < 64; gy++) {
    for (let gx = 0; gx < 64; gx++) {
      const x = bb.minX + ((bb.maxX - bb.minX) * (gx + 0.5)) / 64;
      const y = bb.minY + ((bb.maxY - bb.minY) * (gy + 0.5)) / 64;
      const p = [x, y];
      if (pointInPolygonWithHoles(p, rings)) {
        return {
          point: p,
          method: "CUSTOM_INTERIOR_POINT",
          strategy: "grid_scan_fallback",
        };
      }
    }
  }

  return { point: null, method: "CUSTOM_INTERIOR_POINT", strategy: "failed" };
}

export function multiPolygonCentroid(multiCoords) {
  let total = 0;
  let cx = 0;
  let cy = 0;
  for (const poly of multiCoords) {
    const c = polygonCentroidWithHoles(poly);
    const a = polygonAbsArea(poly);
    if (!c || a <= 0) continue;
    total += a;
    cx += c[0] * a;
    cy += c[1] * a;
  }
  if (total <= 0) return null;
  return [cx / total, cy / total];
}

export function customInteriorPointMultiPolygon(multiCoords) {
  let bestPoly = null;
  let bestArea = -1;
  for (const poly of multiCoords) {
    const a = polygonAbsArea(poly);
    if (a > bestArea) {
      bestArea = a;
      bestPoly = poly;
    }
  }
  if (!bestPoly) {
    return { point: null, method: "CUSTOM_INTERIOR_POINT", strategy: "failed" };
  }
  const inner = customInteriorPointPolygon(bestPoly);
  return {
    point: inner.point,
    method: inner.method,
    strategy: `largest_part_${inner.strategy}`,
  };
}

export function computeRepresentativePoints(geometry) {
  let multiCoords = null;
  if (geometry?.type === "MultiPolygon") multiCoords = geometry.coordinates;
  else if (geometry?.type === "Polygon") multiCoords = [geometry.coordinates];
  else return null;

  const centroid = multiPolygonCentroid(multiCoords);
  const interior = customInteriorPointMultiPolygon(multiCoords);
  return {
    coordinateOrder: "GeoJSON [longitude, latitude] EPSG:4326",
    centroid,
    centroidInside: centroid
      ? pointInMultiPolygon(centroid, multiCoords)
      : false,
    interior,
    interiorInside: interior.point
      ? pointInMultiPolygon(interior.point, multiCoords)
      : false,
  };
}

export function fmtCoord(n) {
  return Number(n.toFixed(6));
}
