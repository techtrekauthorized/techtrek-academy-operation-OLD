import { StudentPortalLayout } from "@/components/student-portal/StudentPortalLayout";
import { StudentPlaceholderPageContent } from "@/components/student-portal/StudentPortalPages";
import { getRequiredStudentPortalProfile } from "@/lib/server/student-portal/page";

export const dynamic = "force-dynamic";

export default async function StudentAttendancePage() {
  const profile = await getRequiredStudentPortalProfile();
  return <StudentPortalLayout profile={profile} title="Attendance" description="Your attendance summary will appear here when a student-safe attendance source is connected."><StudentPlaceholderPageContent title="Your attendance history will appear here." detail="No student-safe attendance source is connected yet."/></StudentPortalLayout>;
}
