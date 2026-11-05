import { existsSync } from "fs";
import Image from "next/image";
import { join } from "path";
import { getCertificateVerificationByToken } from "@/lib/server/services/certificates-service";
import type { CertificateVerificationData } from "@/types/tasks-grades";

const assets = {
  logo: "/brand/techtrek-logo.png",
  stamp: "/brand/techtrek-stamp.png",
  trainingDirectorSignature: "/brand/signatures/training-director.png",
  projectManagerSignature: "/brand/signatures/project-manager.png",
};

type VerifiedCertificate = NonNullable<CertificateVerificationData["certificate"]>;

export default async function CertificateVerificationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let data: CertificateVerificationData;
  try {
    data = await getCertificateVerificationByToken(token);
  } catch {
    data = { status: "RATE_LIMITED", roadmapSections: [], tasks: [], projects: [] };
  }
  if (data.status === "RATE_LIMITED") return <StatePage title="Verification temporarily unavailable" detail="Certificate verification is temporarily unavailable. Please try again shortly." tone="warning"/>;
  if (data.status === "CONFIGURATION_ERROR") return <StatePage title="Verification temporarily unavailable" detail="This certificate cannot be verified right now. Please try again later." tone="warning"/>;
  if (data.status !== "FOUND" || !data.certificate) return <StatePage title="Certificate Not Found" detail="This verification link is invalid or the certificate could not be found." tone="neutral"/>;

  const certificate = data.certificate;
  const revoked = certificate.status === "REVOKED";

  return <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#fff_0,_#f8fafc_48%,_#f1f5f9_100%)] px-4 py-6 text-slate-950 print:bg-white sm:py-10">
    <style>{`@media print{.no-print{display:none!important}.verification-document{box-shadow:none!important;border-color:#cbd5e1!important}.print-avoid{break-inside:avoid}.print-grid{display:grid!important;grid-template-columns:1fr 1fr!important}}`}</style>
    <article className="verification-document mx-auto max-w-6xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-xl shadow-slate-200/70">
      <VerificationHeader certificateName={certificate.certificateName} issueDate={certificate.issueDate} revoked={revoked} revokedAt={certificate.revokedAt}/>
      <div className="space-y-8 p-5 sm:p-8 lg:p-10">
        <section className="grid gap-5 lg:grid-cols-[1.05fr_.95fr]">
          <CertificateSummary certificate={certificate} revoked={revoked}/>
          <AcademicInformation certificate={certificate}/>
        </section>
        <LearningRoadmap sections={data.roadmapSections}/>
        <section className="grid gap-5 lg:grid-cols-2">
          <CompletedTasks tasks={data.tasks}/>
          <CompletedProjects projects={data.projects}/>
        </section>
        <VerificationAuthorizationFooter certificateId={certificate.certificateId}/>
      </div>
    </article>
  </main>;
}

function VerificationHeader({ certificateName, issueDate, revoked, revokedAt }: { certificateName: string; issueDate: string; revoked: boolean; revokedAt?: string }) {
  return <header className="relative overflow-hidden border-b border-slate-200 bg-white px-5 py-6 sm:px-8 lg:px-10">
    <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-red-700 via-red-500 to-slate-900"/>
    <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-4">
        <Image src={assets.logo} alt="TechTrek Academy logo" width={180} height={64} priority className="h-14 w-auto object-contain sm:h-16"/>
        <div>
          <p className="text-xs font-bold uppercase tracking-[.22em] text-red-700">Certificate Verification</p>
          <h1 className="mt-2 max-w-3xl text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{certificateName}</h1>
          <p className="mt-1 text-sm text-slate-500">Issued on {issueDate}{revoked && revokedAt ? ` · Revoked on ${revokedAt}` : ""}</p>
        </div>
      </div>
      <VerificationStatus revoked={revoked}/>
    </div>
  </header>;
}

function VerificationStatus({ revoked }: { revoked: boolean }) {
  return <div className={`print-avoid rounded-2xl border px-5 py-4 text-center ${revoked ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
    <div className="text-2xl font-black">{revoked ? "Certificate Revoked" : "✓ Verified"}</div>
    <p className="mt-1 text-xs font-semibold uppercase tracking-wide">{revoked ? "Not an active certificate" : "Official TechTrek record"}</p>
  </div>;
}

function CertificateSummary({ certificate, revoked }: { certificate: VerifiedCertificate; revoked: boolean }) {
  return <SectionCard title="Certificate Summary">
    <div className="rounded-2xl border border-red-100 bg-red-50/60 p-4">
      <div className="text-xs font-bold uppercase tracking-wide text-red-700">Student Name</div>
      <div className="mt-1 text-2xl font-bold leading-tight text-slate-950">{certificate.studentName}</div>
    </div>
    <dl className="mt-4 grid gap-3 sm:grid-cols-2">
      <Info label="Certificate ID" value={certificate.certificateId}/>
      <Info label="Verification Status" value={revoked ? "Certificate Revoked" : "Verified"}/>
      <Info label="Certificate" value={certificate.certificateName}/>
      <Info label="Issue Date" value={certificate.issueDate}/>
    </dl>
  </SectionCard>;
}

function AcademicInformation({ certificate }: { certificate: VerifiedCertificate }) {
  return <SectionCard title="Academic Information">
    <dl className="grid gap-3 sm:grid-cols-2">
      <Info label="University" value={certificate.university}/>
      <Info label="College" value={certificate.college}/>
      <Info label="University Student ID" value={certificate.universityStudentId}/>
      <Info label="Track" value={certificate.track}/>
      <Info label="Credit Hours" value={`${certificate.creditHours} H`}/>
      <Info label="Delivery Mode" value={certificate.deliveryMode}/>
    </dl>
  </SectionCard>;
}

function LearningRoadmap({ sections }: { sections: Array<{ sectionName: string; topics: string[] }> }) {
  return <SectionCard title="Learning Roadmap" description="Curriculum topics are displayed from the Roadmap snapshot stored on this certificate.">
    {sections.length ? <div className="grid gap-4 md:grid-cols-2">{sections.map(section => <div key={section.sectionName} className="print-avoid rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
      <h3 className="font-bold text-slate-950">{section.sectionName}</h3>
      <ul className="mt-3 space-y-2 text-sm leading-relaxed text-slate-700">{section.topics.map(topic => <li key={topic} className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-700"/><span>{topic}</span></li>)}</ul>
    </div>)}</div> : <EmptyPublicState>No learning roadmap topics are available for this certificate.</EmptyPublicState>}
  </SectionCard>;
}

function CompletedTasks({ tasks }: { tasks: Array<{ title: string }> }) {
  return <SectionCard title="Completed Tasks">
    {tasks.length ? <div className="space-y-2">{tasks.map(task => <div key={task.title} className="print-avoid flex items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-sm font-semibold text-slate-800"><span className="text-emerald-700">✓</span><span>{task.title}</span></div>)}</div> : <EmptyPublicState>No completed tasks available for public verification.</EmptyPublicState>}
  </SectionCard>;
}

function CompletedProjects({ projects }: { projects: Array<{ title: string; result: string }> }) {
  return <SectionCard title="Projects">
    {projects.length ? <div className="space-y-3">{projects.map(project => <ProjectCard key={project.title} project={project}/>)}</div> : <EmptyPublicState>No completed projects available for public verification.</EmptyPublicState>}
  </SectionCard>;
}

function ProjectCard({ project }: { project: { title: string; result: string } }) {
  const percentage = project.result.endsWith("%") ? Number(project.result.slice(0, -1)) : null;
  return <div className="print-avoid rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <h3 className="font-bold text-slate-950">{project.title}</h3>
      {percentage !== null && Number.isFinite(percentage) ? <CircularProjectScore percentage={percentage} label={project.result}/> : <span className="self-start rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-sm font-black text-emerald-700 sm:self-center">{project.result}</span>}
    </div>
  </div>;
}

function CircularProjectScore({ percentage, label }: { percentage: number; label: string }) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, percentage));
  const offset = circumference - (clamped / 100) * circumference;
  return <div className="flex shrink-0 items-center justify-center" role="img" aria-label={`Project completion ${label}`}>
    <svg viewBox="0 0 88 88" className="h-20 w-20 sm:h-24 sm:w-24">
      <circle cx="44" cy="44" r={radius} fill="white" stroke="#fee2e2" strokeWidth="8"/>
      <circle cx="44" cy="44" r={radius} fill="none" stroke="#b91c1c" strokeWidth="8" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} transform="rotate(-90 44 44)"/>
      <text x="44" y="47" textAnchor="middle" className="fill-slate-950 text-[17px] font-black">{label}</text>
    </svg>
  </div>;
}

function VerificationAuthorizationFooter({ certificateId }: { certificateId: string }) {
  return <footer className="print-avoid rounded-3xl border border-slate-200 bg-slate-50/80 p-5 sm:p-6">
    <div className="text-center">
      <p className="text-sm font-bold uppercase tracking-[.18em] text-red-700">Authorized by TechTrek Academy</p>
      <p className="mt-2 text-sm text-slate-600">This verification page confirms that the certificate record above was issued by TechTrek Academy.</p>
    </div>
    <div className="print-grid mt-6 grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-end">
      <SignatureSlot role="Training Director" src={assets.trainingDirectorSignature} expectedPath="/public/brand/signatures/training-director.png"/>
      <StampSlot src={assets.stamp} expectedPath="/public/brand/techtrek-stamp.png"/>
      <SignatureSlot role="Project Manager" src={assets.projectManagerSignature} expectedPath="/public/brand/signatures/project-manager.png"/>
    </div>
    <div className="mt-5 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center text-xs font-semibold text-slate-600">Certificate ID: <span className="font-mono text-slate-900">{certificateId}</span></div>
  </footer>;
}

function SignatureSlot({ role, src, expectedPath }: { role: string; src: string; expectedPath: string }) {
  const exists = publicAssetExists(src);
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
    <div className="flex h-16 items-center justify-center">{exists ? <Image src={src} alt={`${role} signature`} width={220} height={64} className="max-h-16 max-w-full object-contain"/> : <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Signature asset pending</span>}</div>
    <div className="mt-3 border-t border-slate-300 pt-2 text-sm font-bold text-slate-900">{role}</div>
    {!exists && <div className="mt-1 text-[10px] text-slate-400">{expectedPath}</div>}
  </div>;
}

function StampSlot({ src, expectedPath }: { src: string; expectedPath: string }) {
  const exists = publicAssetExists(src);
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center md:w-48">
    <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-slate-200">{exists ? <Image src={src} alt="TechTrek official stamp" width={120} height={96} className="max-h-24 max-w-full object-contain"/> : <span className="px-4 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Official stamp pending</span>}</div>
    {!exists && <div className="mt-1 text-[10px] text-slate-400">{expectedPath}</div>}
  </div>;
}

function SectionCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return <section className="print-avoid rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-100 sm:p-6">
    <div className="mb-4">
      <h2 className="text-lg font-black text-slate-950">{title}</h2>
      {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
    </div>
    {children}
  </section>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3"><dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 text-sm font-semibold text-slate-900">{value || "—"}</dd></div>;
}

function EmptyPublicState({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">{children}</p>;
}

function StatePage({ title, detail, tone }: { title: string; detail: string; tone: "neutral" | "warning" }) {
  return <main className="min-h-screen bg-slate-50 px-4 py-12"><section className={`mx-auto max-w-2xl rounded-2xl border bg-white p-8 text-center shadow-sm ${tone === "warning" ? "border-amber-200" : "border-slate-200"}`}><Image src={assets.logo} alt="TechTrek Academy logo" width={180} height={64} className="mx-auto h-14 w-auto object-contain"/><div className="mt-5 text-xs font-bold uppercase tracking-[.18em] text-red-700">TechTrek Certificate Verification</div><h1 className="mt-3 text-2xl font-bold text-slate-950">{title}</h1><p className="mt-2 text-sm text-slate-500">{detail}</p></section></main>;
}

function publicAssetExists(src: string) {
  return existsSync(join(process.cwd(), "public", src.replace(/^\//, "")));
}
