import { RecoveryTokenService } from "./recovery-token.service";
import { ConfigService } from "@nestjs/config";

describe("RecoveryTokenService", () => {
  const service = new RecoveryTokenService(
    new ConfigService({ RECOVERY_TOKEN_TTL_SECONDS: "900" }),
  );

  it("hashes token consistently", () => {
    const first = service.createToken();
    expect(service.hashToken(first.token)).toBe(first.tokenHash);
  });

  it("creates unique tokens", () => {
    const a = service.createToken();
    const b = service.createToken();
    expect(a.token).not.toBe(b.token);
    expect(a.tokenHash).not.toBe(b.tokenHash);
  });
});
