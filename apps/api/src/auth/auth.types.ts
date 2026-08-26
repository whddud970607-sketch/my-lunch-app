export type UserRole = "driver" | "company_admin" | "platform_admin";

export type AuthUser = {
  userId: string;
  email?: string;
  role: UserRole;
  companyId: string | null;
  driverId: string | null;
  accessToken: string;
};

export type ProfileRow = {
  id: string;
  role: UserRole;
  company_id: string | null;
  display_name: string | null;
};

export type DriverRow = {
  id: string;
  user_id: string;
  company_id: string | null;
  work_status: string;
};
