import { StudentPortalLayout } from "@/components/student-portal/StudentPortalLayout";
import { StudentMaterialsPageContent } from "@/components/student-portal/StudentPortalPages";
import { getRequiredStudentPortalProfile } from "@/lib/server/student-portal/page";

export const dynamic = "force-dynamic";

export default async function StudentMaterialsPage() {
  const profile = await getRequiredStudentPortalProfile();
  return <StudentPortalLayout profile={profile} title="Materials" description="View published learning materials available for your assigned groups."><StudentMaterialsPageContent profile={profile}/></StudentPortalLayout>;
}
