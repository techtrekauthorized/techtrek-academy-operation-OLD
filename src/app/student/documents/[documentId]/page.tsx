import { redirect } from "next/navigation";
import { StudentDocumentViewer } from "@/components/student-portal/StudentDocumentViewer";
import { StudentPortalLayout } from "@/components/student-portal/StudentPortalLayout";
import { getStudentPortalDocument, listStudentPortalDocuments } from "@/lib/server/services/student-documents-service";
import { getRequiredStudentPortalProfile } from "@/lib/server/student-portal/page";
import { getStudentSession } from "@/lib/server/student-portal/session";

export const dynamic = "force-dynamic";

export default async function StudentDocumentPage({ params }: { params: Promise<{ documentId: string }> }) {
  const session = await getStudentSession();
  if (!session) redirect("/student");
  const profile = await getRequiredStudentPortalProfile();
  const { documentId } = await params;
  const [documents, document] = await Promise.all([
    listStudentPortalDocuments(session.academyStudentId, session.studentId),
    getStudentPortalDocument(session.academyStudentId, session.studentId, decodeURIComponent(documentId)),
  ]);
  return <StudentPortalLayout profile={profile} title="Student Document" description={document ? document.documentTypeLabel : "Secure document viewer"}><StudentDocumentViewer document={document} documents={documents}/></StudentPortalLayout>;
}
