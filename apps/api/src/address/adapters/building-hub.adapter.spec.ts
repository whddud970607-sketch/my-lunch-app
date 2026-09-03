import type { ConfigService } from "@nestjs/config";

jest.mock("./building-hub.adapter", () => {
  const actual =
    jest.requireActual<typeof import("./building-hub.adapter")>(
      "./building-hub.adapter",
    );
  return {
    ...actual,
    createBuildingHubFetchPage: jest.fn(
      (
        ...args: Parameters<typeof actual.createBuildingHubFetchPage>
      ) => actual.createBuildingHubFetchPage(...args),
    ),
  };
});

import {
  createBuildingHubFetchPage,
  getBuildingHubServiceKey,
  isBuildingHubConfigured,
} from "./building-hub.adapter";
import { PublicBuildingDataAdapter } from "./public-building-data.adapter";

/** Test doubles only — not real credentials. */
const CANONICAL_FIXTURE = "test-canonical-building-hub-key";
const LEGACY_FIXTURE = "test-legacy-building-hub-key";
const KAKAO_FIXTURE = "test-kakao-rest-key";
const VWORLD_FIXTURE = "test-vworld-api-key";

function mockConfig(map: Record<string, string | undefined>): ConfigService {
  return {
    get: <T = string>(key: string): T | undefined => map[key] as T | undefined,
  } as ConfigService;
}

describe("BuildingHUB Nest config wiring", () => {
  beforeEach(() => {
    jest.mocked(createBuildingHubFetchPage).mockClear();
  });

  it("DATA_GO_KR_SERVICE_KEY only → configured YES", () => {
    const config = mockConfig({
      DATA_GO_KR_SERVICE_KEY: CANONICAL_FIXTURE,
    });
    expect(isBuildingHubConfigured(config)).toBe(true);
    expect(getBuildingHubServiceKey(config)).toBe(CANONICAL_FIXTURE);
  });

  it("legacy DATA_GO_SERVICE_KEY only → configured YES", () => {
    const config = mockConfig({
      DATA_GO_SERVICE_KEY: LEGACY_FIXTURE,
    });
    expect(isBuildingHubConfigured(config)).toBe(true);
    expect(getBuildingHubServiceKey(config)).toBe(LEGACY_FIXTURE);
  });

  it("both set → DATA_GO_KR_SERVICE_KEY is preferred", () => {
    const config = mockConfig({
      DATA_GO_KR_SERVICE_KEY: CANONICAL_FIXTURE,
      DATA_GO_SERVICE_KEY: LEGACY_FIXTURE,
    });
    expect(isBuildingHubConfigured(config)).toBe(true);
    expect(getBuildingHubServiceKey(config)).toBe(CANONICAL_FIXTURE);
    expect(getBuildingHubServiceKey(config)).not.toBe(LEGACY_FIXTURE);
  });

  it("neither set → configured NO", () => {
    const config = mockConfig({});
    expect(isBuildingHubConfigured(config)).toBe(false);
    expect(getBuildingHubServiceKey(config)).toBeNull();
  });

  it("whitespace-only values → configured NO", () => {
    const config = mockConfig({
      DATA_GO_KR_SERVICE_KEY: "   ",
      DATA_GO_SERVICE_KEY: "\t",
    });
    expect(isBuildingHubConfigured(config)).toBe(false);
    expect(getBuildingHubServiceKey(config)).toBeNull();
  });

  it("PublicBuildingDataAdapter uses the same shared helper key", () => {
    const config = mockConfig({
      DATA_GO_KR_SERVICE_KEY: CANONICAL_FIXTURE,
      DATA_GO_SERVICE_KEY: LEGACY_FIXTURE,
      KAKAO_REST_API_KEY: KAKAO_FIXTURE,
      VWORLD_API_KEY: VWORLD_FIXTURE,
    });

    expect(isBuildingHubConfigured(config)).toBe(true);
    expect(getBuildingHubServiceKey(config)).toBe(CANONICAL_FIXTURE);

    const adapter = new PublicBuildingDataAdapter({ config });
    expect(adapter.isConfigured()).toBe(true);
    expect(createBuildingHubFetchPage).toHaveBeenCalledTimes(1);
    expect(jest.mocked(createBuildingHubFetchPage).mock.calls[0]![0]).toBe(
      CANONICAL_FIXTURE,
    );
    expect(
      jest.mocked(createBuildingHubFetchPage).mock.calls[0]![0],
    ).not.toBe(LEGACY_FIXTURE);
  });

  it("PublicBuildingDataAdapter configured with legacy-only hub key", () => {
    const config = mockConfig({
      DATA_GO_SERVICE_KEY: LEGACY_FIXTURE,
      KAKAO_REST_API_KEY: KAKAO_FIXTURE,
      VWORLD_API_KEY: VWORLD_FIXTURE,
    });
    expect(isBuildingHubConfigured(config)).toBe(true);
    const adapter = new PublicBuildingDataAdapter({ config });
    expect(adapter.isConfigured()).toBe(true);
    expect(jest.mocked(createBuildingHubFetchPage).mock.calls[0]![0]).toBe(
      LEGACY_FIXTURE,
    );
  });

  it("PublicBuildingDataAdapter not configured when hub key missing", () => {
    const config = mockConfig({
      KAKAO_REST_API_KEY: KAKAO_FIXTURE,
      VWORLD_API_KEY: VWORLD_FIXTURE,
    });
    expect(isBuildingHubConfigured(config)).toBe(false);
    const adapter = new PublicBuildingDataAdapter({ config });
    expect(adapter.isConfigured()).toBe(false);
    expect(createBuildingHubFetchPage).not.toHaveBeenCalled();
  });

  it("empty service key construction error does not include credential fixtures", () => {
    expect(() => createBuildingHubFetchPage("")).toThrow(
      /BuildingHUB service key is required/,
    );
    try {
      createBuildingHubFetchPage("");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      expect(message).not.toContain(CANONICAL_FIXTURE);
      expect(message).not.toContain(LEGACY_FIXTURE);
      expect(message).not.toMatch(/DATA_GO_/);
    }
  });
});
