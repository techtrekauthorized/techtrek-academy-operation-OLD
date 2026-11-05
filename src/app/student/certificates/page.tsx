import { StudentPortalLayout } from "@/components/student-portal/StudentPortalLayout";
import { StudentCertificatesPageContent } from "@/components/student-portal/StudentPortalPages";
import { getStudentPortalCertificates } from "@/lib/server/student-portal/service";
import { getRequiredStudentPortalProfile } from "@/lib/server/student-portal/page";
import { getStudentSession } from "@/lib/server/student-portal/session";

export const dynamic = "force-dynamic";

export default async function StudentCertificatesPage() {
  const session = await getStudentSession();
  const profile = await getRequiredStudentPortalProfile();
  const certificates = session ? await getStudentPortalCertificates(session.academyStudentId, session.studentId) : [];
  return <StudentPortalLayout profile={profile} title="Certificates" description="Confirm your certificate information and view certificates delivered by TechTrek."><StudentCertificatesPageContent profile={profile} certificates={certificates}/></StudentPortalLayout>;
}
