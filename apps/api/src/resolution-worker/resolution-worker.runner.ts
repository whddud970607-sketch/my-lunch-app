import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  RESOLUTION_WORKER_ENABLED_ENV,
  resolutionWorkerConfigFromEnv,
} from "./resolution-worker.config";
import { ResolutionWorkerService } from "./resolution-worker.service";

/**
 * Optional poller — only starts when RESOLUTION_WORKER_ENABLED=1.
 * API boot with default OFF must not invoke providers.
 */
@Injectable()
export class ResolutionWorkerRunner implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ResolutionWorkerRunner.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly worker: ResolutionWorkerService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const cfg = resolutionWorkerConfigFromEnv(
      this.config as unknown as Record<string, string | undefined>,
    );
    if (!cfg.enabled) {
      this.logger.log(
        `${RESOLUTION_WORKER_ENABLED_ENV} is off; resolution worker not started`,
      );
      return;
    }
    this.logger.log("Resolution worker poller starting");
    this.timer = setInterval(() => {
      void this.tick();
    }, cfg.pollIntervalMs);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.worker.pollOnce();
    } catch (err) {
      this.logger.warn(
        `poll failed: ${err instanceof Error ? err.name : "error"}`,
      );
    } finally {
      this.running = false;
    }
  }
}
