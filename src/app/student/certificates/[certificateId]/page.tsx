import { redirect } from "next/navigation";
import { StudentPortalLayout } from "@/components/student-portal/StudentPortalLayout";
import { StudentCertificateViewer } from "@/components/student-portal/StudentCertificateViewer";
import { getRequiredStudentPortalProfile } from "@/lib/server/student-portal/page";
import { getStudentPortalCertificate, getStudentPortalCertificates, type StudentPortalCertificatePlayback } from "@/lib/server/student-portal/service";
import { getStudentSession } from "@/lib/server/student-portal/session";

export const dynamic = "force-dynamic";

export default async function StudentCertificatePage({ params }: { params: Promise<{ certificateId: string }> }) {
  const session = await getStudentSession();
  if (!session) redirect("/student");
  const profile = await getRequiredStudentPortalProfile();
  const { certificateId } = await params;
  let certificate: StudentPortalCertificatePlayback | null;
  try {
    certificate = await getStudentPortalCertificate(session.academyStudentId, session.studentId, decodeURIComponent(certificateId));
  } catch {
    certificate = null;
  }
  const certificates = await getStudentPortalCertificates(session.academyStudentId, session.studentId);
  return <StudentPortalLayout profile={profile} title="Certificate" description={certificate ? `${certificate.certificateName} · ${certificate.issueDate}` : "Secure certificate viewer"}><StudentCertificateViewer certificate={certificate} certificates={certificates}/></StudentPortalLayout>;
}
