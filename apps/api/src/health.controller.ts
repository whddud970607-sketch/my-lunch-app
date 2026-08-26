import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
  @Get()
  check() {
    return {
      status: "ok",
      service: "delivery-shield-api",
      phase: "1c",
    };
  }
}
