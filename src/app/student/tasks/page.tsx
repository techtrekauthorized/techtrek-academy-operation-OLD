import { StudentPortalLayout } from "@/components/student-portal/StudentPortalLayout";
import { StudentPlaceholderPageContent } from "@/components/student-portal/StudentPortalPages";
import { getRequiredStudentPortalProfile } from "@/lib/server/student-portal/page";

export const dynamic = "force-dynamic";

export default async function StudentTasksPage() {
  const profile = await getRequiredStudentPortalProfile();
  return <StudentPortalLayout profile={profile} title="Tasks & Grades" description="Your assigned tasks and grades will appear here."><StudentPlaceholderPageContent title="Your assigned tasks and grades will appear here." detail="No student-safe tasks and grades source is connected yet."/></StudentPortalLayout>;
}
