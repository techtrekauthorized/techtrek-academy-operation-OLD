"use client";

import { Plus, Settings2, UsersRound } from "lucide-react";
import { useState } from "react";
import { SetupState } from "@/components/ui/SetupState";
import { Breadcrumbs, Button, Card, PageHeader, Tabs } from "@/components/ui/primitives";
import { TrainingOperationsPage } from "@/components/groups/TrainingOperationsPage";

export function TracksGroupsPage() {
  return <TrainingOperationsPage/>;
}

export function TrackDetailPage({ trackId }: { trackId: string }) {
  const [tab, setTab] = useState("Groups Overview");
  return <><Breadcrumbs items={[{ label: "Tracks & Groups", href: "/tracks-groups" }, { label: decodeURIComponent(trackId) }]}/><PageHeader eyebrow="Track Operations" title="Track Setup" description="No configured track or group records are available yet." actions={<><Button disabled variant="secondary">Edit Track</Button><Button disabled><Plus size={15}/>Create New Group</Button></>}/><Card><Tabs tabs={["Groups Overview", "Profitability & Financials", "Syllabus & Assets"]} active={tab} onChange={setTab}/><SetupState icon={<Settings2 size={21}/>} title="Not Configured Yet" detail="This track view will populate after tracks and groups are configured." guidance={`Requested track reference: ${decodeURIComponent(trackId)}`}/></Card></>;
}

export function GroupDetailPage({ groupId }: { groupId: string }) {
  const [tab, setTab] = useState("Overview"); const tabs = ["Overview", "Students", "Sessions & Schedule", "Attendance", "Team", "Collections Summary", "Expenses", "Profitability", "Tasks & Grades", "Activity History"];
  return <><Breadcrumbs items={[{ label: "Tracks & Groups", href: "/tracks-groups" }, { label: "Group Setup" }]}/><Card className="mb-5 overflow-hidden"><div className="h-2 bg-red-700"/><div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center"><div className="flex-1"><h1 className="heading text-2xl font-bold">Group Not Configured</h1><p className="mt-1 text-xs text-slate-500">No operational group matches this reference.</p></div><Button disabled variant="secondary">Edit Group</Button><Button disabled>Assign Student</Button></div><Tabs tabs={tabs} active={tab} onChange={setTab}/></Card><Card><SetupState icon={<UsersRound size={21}/>} title="No Group Data Yet" detail="Group details, students, sessions, attendance, staff, costs, and academic records will appear after group setup." guidance={`Requested group reference: ${decodeURIComponent(groupId)}`}/></Card></>;
}
