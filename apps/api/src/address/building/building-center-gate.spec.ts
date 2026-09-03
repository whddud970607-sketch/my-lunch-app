import { assessBuildingCenterGate } from "./building-center-gate";

const square = {
  type: "MultiPolygon" as const,
  coordinates: [[[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]]],
};

const concaveC = {
  type: "MultiPolygon" as const,
  coordinates: [[[
    [0, 0], [4, 0], [4, 1], [1, 1], [1, 3], [4, 3], [4, 4], [0, 4], [0, 0],
  ]]],
};

describe("building-center-gate", () => {
  it("CUSTOM_INTERIOR_POINT inside verifies BUILDING_CENTER", () => {
    const r = assessBuildingCenterGate(square);
    expect(r.verified).toBe(true);
    expect(r.terminal).toBe("BUILDING_CENTER_VERIFIED");
    expect(r.selectedMethod).toBe("CUSTOM_INTERIOR_POINT");
    expect(r.pinProvenance).toBe("BUILDING_CENTER");
    expect(r.interiorPointInside).toBe(true);
    expect(r.buildingCenter?.lat).not.toBeNull();
    expect(r.buildingCenter?.lng).not.toBeNull();
  });

  it("centroid outside does not block interior point verification", () => {
    const r = assessBuildingCenterGate(concaveC);
    expect(r.verified).toBe(true);
    expect(r.centroidInside).toBe(false);
    expect(r.interiorPointInside).toBe(true);
    expect(r.selectedMethod).toBe("CUSTOM_INTERIOR_POINT");
  });

  it("centroid-only inside path does not verify when interior fails", () => {
    const r = assessBuildingCenterGate(null);
    expect(r.verified).toBe(false);
    expect(r.selectedMethod).toBe("NONE");
    expect(r.pinProvenance).toBeNull();
    expect(r.buildingCenter).toBeNull();
  });
});
