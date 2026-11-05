"use client";

import { Banknote, Plus, ReceiptText, UserRoundCog } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import { SetupState } from "@/components/ui/SetupState";
import { Breadcrumbs, Button, Card, PageHeader, SearchInput, Select, Tabs } from "@/components/ui/primitives";

export function StaffDirectoryPage() {
  return <><PageHeader eyebrow="Delivery Team" title="Staff Directory" description="Instructors, mentors, and coordinators will be configured when delivery setup begins." actions={<Button disabled><Plus size={15}/>Add Staff Record</Button>}/><div className="grid gap-3 sm:grid-cols-3">{["Instructors", "Mentors", "Coordinators"].map(label => <Card className="p-4" key={label}><div className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</div><div className="mt-3 text-sm font-semibold text-slate-500">Not configured</div></Card>)}</div><Card className="mt-5 overflow-hidden"><div className="flex flex-col gap-3 border-b p-4 md:flex-row"><SearchInput className="flex-1" value="" onChange={() => undefined} placeholder="Search staff..."/><Select label="Role" value="" onChange={() => undefined} options={[]}/><Select label="Status" value="" onChange={() => undefined} options={[]}/></div><EmptyTable columns={["Staff", "Role", "Rate", "Approved Hours", "Accrued Earnings", "Assigned Groups", "Status"]} title="No staff records configured yet" detail="Add instructors, mentors, or coordinators when delivery setup begins."/></Card></>;
}

export function StaffProfilePage({ staffId }: { staffId: string }) {
  const [tab, setTab] = useState("Overview"); const tabs = ["Overview", "Assigned Groups", "Shared Teaching Sessions", "Work Hours", "Compensation Plan", "Payroll History", "Payment History"];
  return <><Breadcrumbs items={[{ label: "Staff Directory", href: "/staff-payroll" }, { label: "Staff Profile" }]}/><Card className="overflow-hidden"><div className="h-2 bg-red-700"/><div className="p-5"><h1 className="heading text-2xl font-bold">No Staff Record Configured</h1><p className="mt-1 text-sm text-slate-500">This profile cannot load until staff setup begins.</p></div><Tabs tabs={tabs} active={tab} onChange={setTab}/><SetupState icon={<UserRoundCog size={21}/>} title="No Staff Configured" detail="Profile, assignments, hours, compensation, and payment history will appear after a staff record is created." guidance={`Requested staff reference: ${decodeURIComponent(staffId)}`}/></Card></>;
}

export function PayrollPage() {
  return <><PageHeader eyebrow="Compensation" title="Payroll" description="Payroll starts after staff, sessions, approved hours, and compensation rules are configured." actions={<Button disabled>Run Payroll</Button>}/><Card className="overflow-hidden"><div className="flex flex-col gap-3 border-b p-4 md:flex-row"><Select label="Payroll Period" value="" onChange={() => undefined} options={[]}/><Select label="Status" value="" onChange={() => undefined} options={[]}/></div><EmptyTable icon={<Banknote size={21}/>} columns={["Staff", "Approved Hours", "Rate", "Gross Amount", "Paid Amount", "Remaining Amount", "Status"]} title="No payroll data available yet" detail="Payroll starts after staff, sessions, and compensation rules are configured."/></Card></>;
}

export function ExpensesPage() {
  return <><PageHeader eyebrow="Operating Costs" title="Expenses" description="Record operating expenses after delivery begins and cost categories are configured." actions={<Button disabled><Plus size={15}/>Add Expense</Button>}/><Card className="overflow-hidden"><div className="flex flex-col gap-3 border-b p-4 md:flex-row"><SearchInput className="flex-1" value="" onChange={() => undefined} placeholder="Search expenses..."/><Select label="Category" value="" onChange={() => undefined} options={[]}/><Select label="Approval Status" value="" onChange={() => undefined} options={[]}/></div><EmptyTable icon={<ReceiptText size={21}/>} columns={["Date", "Category", "Vendor", "Amount", "Linked Group / Session", "Approval Status"]} title="No expenses recorded yet" detail="Expenses can be added when operational delivery starts."/></Card></>;
}

function EmptyTable({ columns, title, detail, icon }: { columns: string[]; title: string; detail: string; icon?: ReactNode }) { return <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-start"><thead><tr className="border-b bg-slate-50">{columns.map(column => <th key={column} className="px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">{column}</th>)}</tr></thead><tbody><tr><td colSpan={columns.length}><SetupState icon={icon} title={title} detail={detail}/></td></tr></tbody></table></div>; }
