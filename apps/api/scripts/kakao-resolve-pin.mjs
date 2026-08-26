/**
 * Kakao Local: prefer apartment-dong place coords when detail has N동.
 * Never logs API keys.
 */
export async function resolveKakaoDeliveryPin(restKey, {
  roadAddress,
  detailAddress,
  buildingHint,
}) {
  const addr = await kakaoAddress(restKey, roadAddress);
  const dong = extractDong(detailAddress);
  const building =
    buildingHint ||
    addr.buildingName ||
    extractBuildingFromDetail(detailAddress) ||
    null;

  if (dong && building) {
    const places = await kakaoKeyword(restKey, `${building} ${dong}동`, {
      x: addr.longitude,
      y: addr.latitude,
      radius: 1000,
    });
    const dongPlace = places.find(
      (p) =>
        String(p.category_name || "").includes("아파트 동") &&
        String(p.place_name || "").includes(`${dong}동`),
    );
    if (dongPlace?.x && dongPlace?.y) {
      return {
        longitude: Number(dongPlace.x),
        latitude: Number(dongPlace.y),
        addressName: addr.addressName,
        buildingName: building,
        placeName: dongPlace.place_name,
        addressType: addr.addressType,
        provider: "kakao",
        geocodeSource: "keyword_apartment_dong",
        pinAccuracy: "building",
      };
    }
  }

  return {
    longitude: addr.longitude,
    latitude: addr.latitude,
    addressName: addr.addressName,
    buildingName: addr.buildingName,
    placeName: null,
    addressType: addr.addressType,
    provider: "kakao",
    geocodeSource: "address",
    pinAccuracy: addr.buildingName ? "building" : "address",
  };
}

function extractDong(detail) {
  const m = String(detail || "").match(/(\d+)\s*동/);
  return m ? m[1] : null;
}

function extractBuildingFromDetail(detail) {
  const s = String(detail || "");
  const m = s.match(/^(.+?)\s+\d+\s*동/);
  return m ? m[1].trim() : null;
}

async function kakaoAddress(restKey, query) {
  const url = new URL("https://dapi.kakao.com/v2/local/search/address.json");
  url.searchParams.set("query", query);
  const res = await fetch(url, {
    headers: { Authorization: `KakaoAK ${restKey}` },
  });
  const body = await res.json().catch(() => null);
  const doc = body?.documents?.[0];
  if (res.status !== 200 || !doc?.x || !doc?.y) {
    throw new Error(
      body?.message ||
        `address geocode failed http=${res.status} type=${body?.errorType}`,
    );
  }
  return {
    longitude: Number(doc.x),
    latitude: Number(doc.y),
    addressName: doc.address_name ?? null,
    buildingName: doc.road_address?.building_name ?? null,
    addressType: doc.address_type ?? null,
  };
}

async function kakaoKeyword(restKey, query, { x, y, radius }) {
  const url = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
  url.searchParams.set("query", query);
  url.searchParams.set("size", "15");
  if (x != null && y != null) {
    url.searchParams.set("x", String(x));
    url.searchParams.set("y", String(y));
    url.searchParams.set("radius", String(radius ?? 1000));
  }
  const res = await fetch(url, {
    headers: { Authorization: `KakaoAK ${restKey}` },
  });
  const body = await res.json().catch(() => null);
  if (res.status !== 200) {
    throw new Error(
      body?.message || `keyword search failed http=${res.status}`,
    );
  }
  return body?.documents || [];
}
