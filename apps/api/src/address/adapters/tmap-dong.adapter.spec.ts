import {
  TmapDongAdapter,
  TMAP_REVERSE_VERIFIED_EVIDENCE,
} from "./tmap-dong.adapter";
import { TMAP_POI_COORD_PRIORITY } from "../tmap-coord";

const APT = "서창센트럴푸르지오";
const OTHER_APT = "다른아파트";

function jsonRes(body: unknown, status = 200) {
  return {
    status,
    json: async () => body,
  };
}

describe("TmapDongAdapter exact-dong reverse verification", () => {
  it("exports coord priority constant noor → pns → front", () => {
    expect([...TMAP_POI_COORD_PRIORITY]).toEqual(["noor", "pns", "front"]);
  });

  it("A: noor reverse buildingName …503동 → verified YES", async () => {
    const reverseCalls: string[] = [];
    const fetchFn = jest.fn(async (url: string) => {
      if (url.includes("/pois")) {
        return jsonRes({
          searchPoiInfo: {
            pois: {
              poi: {
                name: `${APT}아파트 503동`,
                frontLat: "37.42891057",
                frontLon: "126.75071231",
                noorLat: "37.42832726",
                noorLon: "126.74857363",
                pnsLat: "37.42832726",
                pnsLon: "126.74857363",
              },
            },
          },
        });
      }
      if (url.includes("reversegeocoding")) {
        reverseCalls.push(url);
        const u = new URL(url);
        const lat = u.searchParams.get("lat");
        if (lat?.startsWith("37.428327")) {
          return jsonRes({
            addressInfo: { buildingName: `${APT} 503동` },
          });
        }
        return jsonRes({ addressInfo: { buildingName: "" } });
      }
      return jsonRes({}, 404);
    });
    const adapter = new TmapDongAdapter("key", fetchFn as never);
    const hits = await adapter.lookupExactDongCandidates({
      buildingName: APT,
      dong: "503",
    });
    expect(hits).toHaveLength(1);
    expect(hits[0].verification).toBe("verified");
    expect(hits[0].latitude).toBeCloseTo(37.42832726, 6);
    expect(hits[0].longitude).toBeCloseTo(126.74857363, 6);
    expect(hits[0].evidence).toContain("tmap_poi_coord_kind=noor");
    expect(hits[0].evidence).toContain(TMAP_REVERSE_VERIFIED_EVIDENCE);
    expect(reverseCalls[0]).toContain("buildingDetailYn=Y");
  });

  it("B: front reverse buildingName=\"\" → reject front → try next (noor verified)", async () => {
    const reverseLats: string[] = [];
    const fetchFn = jest.fn(async (url: string) => {
      if (url.includes("/pois")) {
        return jsonRes({
          searchPoiInfo: {
            pois: {
              poi: {
                name: `${APT}아파트 503동`,
                // no noor — so order: pns miss, front fail, then… only front+pns
                // include noor empty and pns empty so front tried then we need another
                frontLat: "37.42891057",
                frontLon: "126.75071231",
                noorLat: "37.42829218",
                noorLon: "126.74861487",
                pnsLat: "",
                pnsLon: "",
              },
            },
          },
        });
      }
      if (url.includes("reversegeocoding")) {
        const u = new URL(url);
        const lat = u.searchParams.get("lat") || "";
        reverseLats.push(lat);
        if (lat.startsWith("37.428910")) {
          return jsonRes({ addressInfo: { buildingName: "" } });
        }
        if (lat.startsWith("37.428292")) {
          return jsonRes({
            addressInfo: { buildingName: `${APT} 503동` },
          });
        }
        return jsonRes({ addressInfo: { buildingName: "" } });
      }
      return jsonRes({}, 404);
    });
    const adapter = new TmapDongAdapter("key", fetchFn as never);
    const hits = await adapter.lookupExactDongCandidates({
      buildingName: APT,
      dong: "503동",
    });
    // Priority is noor first — noor verifies immediately (front never needed).
    // Separate case: empty noor, empty pns, front empty reverse, then no more → []
    expect(hits[0]?.evidence).toContain("tmap_poi_coord_kind=noor");
    expect(reverseLats[0]).toMatch(/^37\.428292/);
  });

  it("B2: front empty reverse rejected then pns verified", async () => {
    const reverseLats: string[] = [];
    const fetchFn = jest.fn(async (url: string) => {
      if (url.includes("/pois")) {
        return jsonRes({
          searchPoiInfo: {
            pois: {
              poi: {
                name: `${APT}아파트 503동`,
                frontLat: "37.42891057",
                frontLon: "126.75071231",
                noorLat: "",
                noorLon: "",
                pnsLat: "37.42832726",
                pnsLon: "126.74857363",
              },
            },
          },
        });
      }
      if (url.includes("reversegeocoding")) {
        const lat = new URL(url).searchParams.get("lat") || "";
        reverseLats.push(lat);
        if (lat.startsWith("37.428910")) {
          return jsonRes({ addressInfo: { buildingName: "" } });
        }
        return jsonRes({
          addressInfo: { buildingName: `${APT} 503동` },
        });
      }
      return jsonRes({}, 404);
    });
    const adapter = new TmapDongAdapter("key", fetchFn as never);
    const hits = await adapter.lookupExactDongCandidates({
      buildingName: APT,
      dong: "503",
    });
    expect(hits).toHaveLength(1);
    expect(hits[0].evidence).toContain("tmap_poi_coord_kind=pns");
    expect(hits[0].latitude).toBeCloseTo(37.42832726, 5);
    // noor skipped (empty), pns tried first among remaining — front not needed if pns ok
    expect(reverseLats[0]).toMatch(/^37\.428327/);
  });

  it("B3: only front present + empty reverse → no exact candidate", async () => {
    const fetchFn = jest.fn(async (url: string) => {
      if (url.includes("/pois")) {
        return jsonRes({
          searchPoiInfo: {
            pois: {
              poi: {
                name: `${APT}아파트 503동`,
                frontLat: "37.42891057",
                frontLon: "126.75071231",
              },
            },
          },
        });
      }
      return jsonRes({ addressInfo: { buildingName: "" } });
    });
    const adapter = new TmapDongAdapter("key", fetchFn as never);
    await expect(
      adapter.lookupExactDongCandidates({
        buildingName: APT,
        dong: "503동",
      }),
    ).resolves.toEqual([]);
  });

  it("C: reverse 501동 → rejected", async () => {
    const adapter = new TmapDongAdapter(
      "key",
      jest.fn(async (url: string) => {
        if (url.includes("/pois")) {
          return jsonRes({
            searchPoiInfo: {
              pois: {
                poi: {
                  name: `${APT} 503동`,
                  noorLat: "37.42829",
                  noorLon: "126.74861",
                },
              },
            },
          });
        }
        return jsonRes({
          addressInfo: { buildingName: `${APT} 501동` },
        });
      }) as never,
    );
    await expect(
      adapter.lookupExactDongCandidates({
        buildingName: APT,
        dong: "503동",
      }),
    ).resolves.toEqual([]);
  });

  it("D: reverse 1503동 → rejected", async () => {
    const adapter = new TmapDongAdapter(
      "key",
      jest.fn(async (url: string) => {
        if (url.includes("/pois")) {
          return jsonRes({
            searchPoiInfo: {
              pois: {
                poi: {
                  name: `${APT} 503동`,
                  noorLat: "37.42829",
                  noorLon: "126.74861",
                },
              },
            },
          });
        }
        return jsonRes({
          addressInfo: { buildingName: `${APT} 1503동` },
        });
      }) as never,
    );
    await expect(
      adapter.lookupExactDongCandidates({
        buildingName: APT,
        dong: "503",
      }),
    ).resolves.toEqual([]);
  });

  it("E: reverse 503호 → rejected", async () => {
    const adapter = new TmapDongAdapter("key");
    expect(
      adapter.judgeReverseExactDong({
        buildingName: APT,
        requestedDong: "503동",
        reverse: {
          buildingName: `${APT} 503호`,
          buildingDong: null,
          fullAddress: null,
        },
      }),
    ).toBe("rejected");
  });

  it("F: same dong number different apartment → rejected", async () => {
    const adapter = new TmapDongAdapter(
      "key",
      jest.fn(async (url: string) => {
        if (url.includes("/pois")) {
          return jsonRes({
            searchPoiInfo: {
              pois: {
                poi: {
                  name: `${APT} 503동`,
                  noorLat: "37.42829",
                  noorLon: "126.74861",
                },
              },
            },
          });
        }
        return jsonRes({
          addressInfo: { buildingName: `${OTHER_APT} 503동` },
        });
      }) as never,
    );
    await expect(
      adapter.lookupExactDongCandidates({
        buildingName: APT,
        dong: "503동",
      }),
    ).resolves.toEqual([]);
  });

  it("G: geocode buildingDong=501동 → BASE only, exact NO", async () => {
    const fetchFn = jest.fn(async (url: string) => {
      if (url.includes("fullAddrGeo")) {
        return jsonRes({
          coordinateInfo: {
            coordinate: [
              {
                lat: "",
                lon: "",
                newLat: "37.429699",
                newLon: "126.748144",
                buildingName: APT,
                buildingDong: "501동",
              },
            ],
          },
        });
      }
      return jsonRes({}, 404);
    });
    const adapter = new TmapDongAdapter("key", fetchFn as never);
    const base = await adapter.lookupBaseAddressCandidate({
      roadAddress: "인천 남동구 서창남순환로 55",
      requestedDong: "503동",
    });
    expect(base).not.toBeNull();
    expect(base!.matchType).toBe("base_address");
    expect(base!.sourceType).toBe("tmap_base_address");
    expect(base!.matchedDong).toBeNull();
    expect(base!.latitude).toBeCloseTo(37.429699, 5);
    expect(base!.evidence).toContain("BASE_COORDINATE_ONLY");
    expect(base!.evidence).toContain("BASE_NOT_PROMOTED_TO_EXACT");
  });
});
