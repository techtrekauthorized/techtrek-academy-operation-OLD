import { redirect } from "next/navigation";
import { StudentPortalLogin } from "@/components/student-portal/StudentPortalLogin";
import { StudentPortalLayout } from "@/components/student-portal/StudentPortalLayout";
import { StudentOverview } from "@/components/student-portal/StudentPortalPages";
import { getStudentPortalProfile, type StudentPortalProfile } from "@/lib/server/student-portal/service";
import { getStudentSession } from "@/lib/server/student-portal/session";

export const dynamic = "force-dynamic";

export default async function StudentLoginPage() {
  const session = await getStudentSession();
  if (session) {
    let profile: StudentPortalProfile;
    try {
      profile = await getStudentPortalProfile(session.academyStudentId, session.studentId);
    } catch {
      redirect("/student");
    }
    return <StudentPortalLayout profile={profile} title="Student Overview" description="Your TechTrek learning, materials, payments, and profile in one place."><StudentOverview profile={profile}/></StudentPortalLayout>;
  }
  return <StudentPortalLogin/>;
}
