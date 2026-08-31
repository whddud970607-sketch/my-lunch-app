import { Test, TestingModule } from "@nestjs/testing";
import { AccountRecoveryRepository } from "../account-recovery/account-recovery.repository";
import { UserIdentityProfilesService } from "./user-identity-profiles.service";

describe("UserIdentityProfilesService", () => {
  let service: UserIdentityProfilesService;
  const repository = {
    findIdentityProfileByUserId: jest.fn(),
    insertIdentityProfile: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserIdentityProfilesService,
        { provide: AccountRecoveryRepository, useValue: repository },
      ],
    }).compile();
    service = module.get(UserIdentityProfilesService);
  });

  it("returns already_exists without insert", async () => {
    repository.findIdentityProfileByUserId.mockResolvedValue({ user_id: "u1" });
    const result = await service.provisionOnSignup({
      userId: "u1",
      legalName: "Tester",
      birthDate: "1990-01-01",
      phone: "01012345678",
    });
    expect(result).toBe("already_exists");
    expect(repository.insertIdentityProfile).not.toHaveBeenCalled();
  });

  it("creates profile on signup", async () => {
    repository.findIdentityProfileByUserId.mockResolvedValue(null);
    repository.insertIdentityProfile.mockResolvedValue(undefined);
    const result = await service.provisionOnSignup({
      userId: "u1",
      legalName: "Tester",
      birthDate: "1990-01-01",
      phone: "010-1234-5678",
    });
    expect(result).toBe("created");
    expect(repository.insertIdentityProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        phoneE164: "+821012345678",
      }),
    );
  });
});
