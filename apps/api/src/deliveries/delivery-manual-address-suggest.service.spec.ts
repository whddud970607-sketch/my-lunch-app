import { BadRequestException, ServiceUnavailableException } from "@nestjs/common";
import { DeliveryManualAddressSuggestService } from "./delivery-manual-address-suggest.service";
import type { AddressResolutionService } from "../address/address-resolution.service";

describe("DeliveryManualAddressSuggestService", () => {
  it("rejects short query", async () => {
    const svc = new DeliveryManualAddressSuggestService({
      isKakaoConfigured: () => true,
      searchAddressDocuments: jest.fn(),
    } as unknown as AddressResolutionService);
    await expect(svc.suggest(" ")).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.suggest("한")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("returns public candidate DTO only", async () => {
    const search = jest.fn().mockResolvedValue([
      {
        roadAddress: "인천광역시 남동구 서창남순환로 55",
        jibunAddress: "인천광역시 남동구 서창동 123",
        buildingName: "에코에비뉴",
        latitude: 37.42,
        longitude: 126.74,
      },
    ]);
    const svc = new DeliveryManualAddressSuggestService({
      isKakaoConfigured: () => true,
      searchAddressDocuments: search,
    } as unknown as AddressResolutionService);
    const out = await svc.suggest("서창남순환로");
    expect(out.results).toHaveLength(1);
    const keys = Object.keys(out.results[0]).sort();
    expect(keys).toEqual([
      "buildingName",
      "jibunAddress",
      "latitude",
      "longitude",
      "roadAddress",
    ]);
    expect(JSON.stringify(out)).not.toMatch(/phone/i);
    expect(JSON.stringify(out)).not.toMatch(/customer/i);
    expect(JSON.stringify(out)).not.toMatch(/secret/i);
  });

  it("maps provider failure without leaking query", async () => {
    const svc = new DeliveryManualAddressSuggestService({
      isKakaoConfigured: () => true,
      searchAddressDocuments: jest.fn().mockRejectedValue(new Error("kakao boom")),
    } as unknown as AddressResolutionService);
    await expect(svc.suggest("서창남순환로")).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
