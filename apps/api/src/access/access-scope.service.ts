import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { AuthUser } from "../auth/auth.types";

/**
 * Application-layer scope checks that mirror RLS intent.
 * Used even when queries go through user-JWT Supabase (defense in depth).
 */
@Injectable()
export class AccessScopeService {
  forUser(user: AuthUser) {
    return {
      user,
      assertSelf(userId: string) {
        if (user.userId !== userId) {
          throw new ForbiddenException("Cross-user access denied");
        }
      },
      assertDriverSelf(driverId: string | null | undefined) {
        if (!user.driverId || !driverId || user.driverId !== driverId) {
          throw new ForbiddenException("Driver scope denied");
        }
      },
      assertSameCompany(companyId: string | null | undefined) {
        if (user.role === "platform_admin") {
          return;
        }
        if (
          user.role !== "company_admin" ||
          !user.companyId ||
          !companyId ||
          user.companyId !== companyId
        ) {
          throw new ForbiddenException("Company scope denied");
        }
      },
      /**
       * Driver may only see own rows; company_admin only own company;
       * platform_admin operational oversight (still no access_info via this API).
       */
      assertCanAccessDriverResource(args: {
        driverId: string;
        companyId: string | null;
      }) {
        if (user.role === "driver") {
          if (!user.driverId || user.driverId !== args.driverId) {
            throw new ForbiddenException("Driver scope denied");
          }
          return;
        }
        if (user.role === "company_admin") {
          if (
            !user.companyId ||
            !args.companyId ||
            user.companyId !== args.companyId
          ) {
            throw new ForbiddenException("Company scope denied");
          }
          return;
        }
        if (user.role === "platform_admin") {
          return;
        }
        throw new ForbiddenException("Unknown role");
      },
      requireDriverId(): string {
        if (!user.driverId) {
          throw new NotFoundException("Driver profile not found");
        }
        return user.driverId;
      },
    };
  }

  /** There is intentionally no client-facing promote-to-platform_admin API. */
  denyClientRoleElevation(): never {
    throw new ForbiddenException(
      "Role elevation is not available via client APIs",
    );
  }
}
