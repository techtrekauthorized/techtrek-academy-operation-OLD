import { redirect } from "next/navigation";
import { StudentPortalLayout } from "@/components/student-portal/StudentPortalLayout";
import { StudentMaterialViewer } from "@/components/student-portal/StudentMaterialViewer";
import { getStudentPortalMaterial, type StudentPortalMaterialPlayback } from "@/lib/server/student-portal/service";
import { getRequiredStudentPortalProfile } from "@/lib/server/student-portal/page";
import { getStudentSession } from "@/lib/server/student-portal/session";

export const dynamic = "force-dynamic";

export default async function StudentMaterialPage({ params }: { params: Promise<{ materialId: string }> }) {
  const session = await getStudentSession();
  if (!session) redirect("/student");
  const profile = await getRequiredStudentPortalProfile();
  const { materialId } = await params;
  let material: StudentPortalMaterialPlayback | null;
  try {
    material = await getStudentPortalMaterial(session.academyStudentId, session.studentId, decodeURIComponent(materialId));
  } catch {
    redirect("/student");
  }
  return <StudentPortalLayout profile={profile} title="Session Material" description={material ? `Session ${material.sessionNumber} · ${material.levelCode} · ${material.materialType}` : "Secure material viewer"}><StudentMaterialViewer material={material} materials={profile.sessionMaterials}/></StudentPortalLayout>;
}
