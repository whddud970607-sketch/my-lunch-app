import { classifyUnresolved, unresolvedUserMessage } from "./unresolved-classifier.service";
import type { PinPlacementDecision } from "./address.types";

describe("unresolved-classifier.service", () => {
  it("classifies dong-required unresolved", () => {
    const decision: PinPlacementDecision = {
      candidate: null,
      pinQuality: "UNRESOLVED",
      pinAccuracy: "address",
      unresolvedReason: "dong_required_but_unresolved",
      failureMessage: "x",
      allCandidates: [],
      requiresDong: true,
    };
    expect(classifyUnresolved(decision)).toBe("dong_required_but_unresolved");
    expect(unresolvedUserMessage("dong_required_but_unresolved")).toContain("dong");
  });
});
