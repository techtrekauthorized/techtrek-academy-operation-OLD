import { StudentPortalLayout } from "@/components/student-portal/StudentPortalLayout";
import { StudentProfilePageContent } from "@/components/student-portal/StudentPortalPages";
import { getRequiredStudentPortalProfile } from "@/lib/server/student-portal/page";

export const dynamic = "force-dynamic";

export default async function StudentProfilePage() {
  const profile = await getRequiredStudentPortalProfile();
  return <StudentPortalLayout profile={profile} title="Profile" description="Your read-only student information."><StudentProfilePageContent profile={profile}/></StudentPortalLayout>;
}
