import { CarrierIngestContactProvider } from "./carrier-ingest.contact-provider";

describe("CarrierIngestContactProvider", () => {
  const provider = new CarrierIngestContactProvider();

  it("returns none when no carrier number", async () => {
    const result = await provider.resolveContact({ pointId: "p1" });
    expect(result.contactType).toBe("none");
    expect(result.contactValue).toBeNull();
  });

  it("stores masked_number from carrier-safe input (not raw-phone column model)", async () => {
    const result = await provider.resolveContact({
      pointId: "p1",
      carrierSafeNumber: "050-1234-5678",
      providerReference: "ext-1",
    });
    expect(result.contactType).toBe("masked_number");
    expect(result.contactValue).toBe("050-1234-5678");
    expect(result.contactProvider).toBe("carrier_ingest");
  });
});
