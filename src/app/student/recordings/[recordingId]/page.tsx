import { redirect } from "next/navigation";
import { StudentPortalLayout } from "@/components/student-portal/StudentPortalLayout";
import { StudentRecordingPlayer } from "@/components/student-portal/StudentRecordingPlayer";
import { getStudentPortalRecording, type StudentPortalRecordingPlayback } from "@/lib/server/student-portal/service";
import { getRequiredStudentPortalProfile } from "@/lib/server/student-portal/page";
import { getStudentSession } from "@/lib/server/student-portal/session";

export const dynamic = "force-dynamic";

export default async function StudentRecordingPage({ params }: { params: Promise<{ recordingId: string }> }) {
  const session = await getStudentSession();
  if (!session) redirect("/student");
  const profile = await getRequiredStudentPortalProfile();
  const { recordingId } = await params;
  let recording: StudentPortalRecordingPlayback | null;
  try {
    recording = await getStudentPortalRecording(session.academyStudentId, session.studentId, decodeURIComponent(recordingId));
  } catch {
    redirect("/student");
  }
  return <StudentPortalLayout profile={profile} title="Recorded Session" description={recording ? `Session ${recording.sessionNumber} · ${recording.levelCode}` : "Secure recording viewer"}><StudentRecordingPlayer recording={recording} recordings={profile.recordedSessions}/></StudentPortalLayout>;
}
