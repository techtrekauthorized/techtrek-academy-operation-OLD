import type { UserRole } from "@/lib/auth/permissions";

export type SafeUser = {
  userId: string;
  username: string;
  displayName: string;
  role: UserRole;
};

export type SessionPayload = SafeUser & {
  issuedAt: number;
  expiresAt: number;
};

