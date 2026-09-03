import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { ResolutionWorkerRunner } from "./resolution-worker.runner";
import { ResolutionWorkerService } from "./resolution-worker.service";

describe("ResolutionWorkerRunner", () => {
  it("does not start poller when RESOLUTION_WORKER_ENABLED is off", async () => {
    const pollOnce = jest.fn().mockResolvedValue(0);
    const moduleRef = await Test.createTestingModule({
      providers: [
        ResolutionWorkerRunner,
        {
          provide: ResolutionWorkerService,
          useValue: { pollOnce },
        },
        {
          provide: ConfigService,
          useValue: {
            get: () => undefined,
          },
        },
      ],
    }).compile();

    const runner = moduleRef.get(ResolutionWorkerRunner);
    runner.onModuleInit();

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(pollOnce).not.toHaveBeenCalled();
    runner.onModuleDestroy();
  });
});
