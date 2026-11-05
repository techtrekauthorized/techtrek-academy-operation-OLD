import { redirect } from "next/navigation";
import { StudentPortalLayout } from "@/components/student-portal/StudentPortalLayout";
import { StudentDocumentsPageContent } from "@/components/student-portal/StudentPortalPages";
import { listStudentPortalDocuments } from "@/lib/server/services/student-documents-service";
import { getRequiredStudentPortalProfile } from "@/lib/server/student-portal/page";
import { getStudentSession } from "@/lib/server/student-portal/session";

export const dynamic = "force-dynamic";

export default async function StudentDocumentsPage() {
  const session = await getStudentSession();
  if (!session) redirect("/student");
  const profile = await getRequiredStudentPortalProfile();
  const documents = await listStudentPortalDocuments(session.academyStudentId, session.studentId);
  return <StudentPortalLayout profile={profile} title="My Documents" description="View and download official documents published by TechTrek."><StudentDocumentsPageContent documents={documents}/></StudentPortalLayout>;
}
