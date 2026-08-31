import { Body, Controller, Post, Req } from "@nestjs/common";
import { AccountRecoveryService } from "./account-recovery.service";

type RequestWithIp = { ip?: string };

@Controller("auth/recovery/reset-password")
export class AccountRecoveryController {
  constructor(private readonly recovery: AccountRecoveryService) {}

  @Post("start")
  start(
    @Body()
    body: {
      legalName?: string;
      birthDate?: string;
      phone?: string;
    },
    @Req() req: RequestWithIp,
  ) {
    return this.recovery.startResetPassword({
      legalName: body.legalName ?? "",
      birthDate: body.birthDate ?? "",
      phone: body.phone ?? "",
      clientIp: req.ip,
    });
  }

  @Post("confirm")
  confirm(
    @Body()
    body: {
      verificationSessionId?: string;
      otp?: string;
    },
    @Req() req: RequestWithIp,
  ) {
    return this.recovery.confirmResetPassword({
      verificationSessionId: body.verificationSessionId ?? "",
      otp: body.otp ?? "",
      clientIp: req.ip,
    });
  }

  @Post("complete")
  complete(
    @Body()
    body: {
      recoveryToken?: string;
      newPassword?: string;
    },
    @Req() req: RequestWithIp,
  ) {
    return this.recovery.completeResetPassword({
      recoveryToken: body.recoveryToken ?? "",
      newPassword: body.newPassword ?? "",
      clientIp: req.ip,
    });
  }
}
