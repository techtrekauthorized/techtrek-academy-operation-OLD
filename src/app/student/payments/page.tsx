import { StudentPortalLayout } from "@/components/student-portal/StudentPortalLayout";
import { StudentPaymentsPageContent } from "@/components/student-portal/StudentPortalPages";
import { getRequiredStudentPortalProfile } from "@/lib/server/student-portal/page";

export const dynamic = "force-dynamic";

export default async function StudentPaymentsPage() {
  const profile = await getRequiredStudentPortalProfile();
  return <StudentPortalLayout profile={profile} title="Payments & Receipts" description="Read-only enrollment, payment, and receipt information."><StudentPaymentsPageContent profile={profile}/></StudentPortalLayout>;
}
