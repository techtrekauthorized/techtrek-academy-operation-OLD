import "server-only";
import { redirect } from "next/navigation";
import { getStudentPortalProfile, type StudentPortalProfile } from "@/lib/server/student-portal/service";
import { getStudentSession } from "@/lib/server/student-portal/session";

export async function getRequiredStudentPortalProfile(): Promise<StudentPortalProfile> {
  const session = await getStudentSession();
  if (!session) redirect("/student");
  try {
    return await getStudentPortalProfile(session.academyStudentId, session.studentId);
  } catch {
    redirect("/student");
  }
}
