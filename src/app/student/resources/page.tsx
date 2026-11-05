import { redirect } from "next/navigation";
import { StudentPortalLayout } from "@/components/student-portal/StudentPortalLayout";
import { StudentResourcesPageContent } from "@/components/student-portal/StudentPortalPages";
import { getRequiredStudentPortalProfile } from "@/lib/server/student-portal/page";
import { getStudentPortalLearningResources } from "@/lib/server/student-portal/service";
import { getStudentSession } from "@/lib/server/student-portal/session";

export const dynamic = "force-dynamic";

export default async function StudentResourcesPage() {
  const session = await getStudentSession();
  if (!session) redirect("/student");
  const profile = await getRequiredStudentPortalProfile();
  const resources = await getStudentPortalLearningResources(session.academyStudentId, session.studentId);
  return <StudentPortalLayout profile={profile} title="Learning Resources" description="Additional videos selected by TechTrek for your assigned groups."><StudentResourcesPageContent resources={resources}/></StudentPortalLayout>;
}
