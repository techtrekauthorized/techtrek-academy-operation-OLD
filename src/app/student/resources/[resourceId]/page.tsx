import { redirect } from "next/navigation";
import { StudentPortalLayout } from "@/components/student-portal/StudentPortalLayout";
import { StudentResourcePlayer } from "@/components/student-portal/StudentResourcePlayer";
import { getRequiredStudentPortalProfile } from "@/lib/server/student-portal/page";
import { getStudentPortalLearningResource, getStudentPortalLearningResources } from "@/lib/server/student-portal/service";
import { getStudentSession } from "@/lib/server/student-portal/session";

export const dynamic = "force-dynamic";

export default async function StudentResourcePage({ params }: { params: Promise<{ resourceId: string }> }) {
  const session = await getStudentSession();
  if (!session) redirect("/student");
  const profile = await getRequiredStudentPortalProfile();
  const { resourceId } = await params;
  const [resources, resource] = await Promise.all([
    getStudentPortalLearningResources(session.academyStudentId, session.studentId),
    getStudentPortalLearningResource(session.academyStudentId, session.studentId, decodeURIComponent(resourceId)),
  ]);
  return <StudentPortalLayout profile={profile} title="Learning Resource" description={resource ? resource.resourceCategory : "Secure resource viewer"}><StudentResourcePlayer resource={resource} resources={resources}/></StudentPortalLayout>;
}
