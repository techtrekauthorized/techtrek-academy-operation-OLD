import "server-only";
import { isUserRole } from "@/lib/auth/permissions";
import { readSheet } from "@/lib/server/google/sheets";
import type { UserRow } from "@/lib/server/types";
import type { SafeUser } from "./types";

export type LoginResult = { status: "success"; user: SafeUser } | { status: "invalid" } | { status: "inactive" };

function isActive(value: string) {
  return value.trim().toUpperCase() === "TRUE";
}

export async function authenticateUser(username: string, submittedPassword: string): Promise<LoginResult> {
  const normalized = username.trim().toLowerCase();
  const matches = (await readSheet<UserRow>("Users")).filter(row => row.Username.trim().toLowerCase() === normalized);
  if (matches.length !== 1) return { status: "invalid" };
  const user = matches[0];
  if (submittedPassword !== user.Password) return { status: "invalid" };
  if (!isActive(user.Is_Active)) return { status: "inactive" };
  const role = user.Role.trim().toUpperCase();
  if (!isUserRole(role)) return { status: "invalid" };
  return { status: "success", user: { userId: user.User_ID, username: user.Username, displayName: user.Display_Name, role } };
}

export async function verifyCurrentAdminPassword(userId: string, submittedPassword: string) {
  const user = (await readSheet<UserRow>("Users")).find(row => row.User_ID === userId);
  return Boolean(user && isActive(user.Is_Active) && user.Role.trim().toUpperCase() === "ADMIN" && submittedPassword === user.Password);
}
