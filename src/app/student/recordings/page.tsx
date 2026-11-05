import { StudentPortalLayout } from "@/components/student-portal/StudentPortalLayout";
import { StudentRecordingsPageContent } from "@/components/student-portal/StudentPortalPages";
import { getRequiredStudentPortalProfile } from "@/lib/server/student-portal/page";

export const dynamic = "force-dynamic";

export default async function StudentRecordingsPage() {
  const profile = await getRequiredStudentPortalProfile();
  return <StudentPortalLayout profile={profile} title="Recordings" description="Watch published recordings available for your assigned groups."><StudentRecordingsPageContent profile={profile}/></StudentPortalLayout>;
}
