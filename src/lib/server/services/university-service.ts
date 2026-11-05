import "server-only";
import { readSheet } from "../google/sheets";
import type { UniversityRow } from "../types";
import { activeValue } from "./mappers";

export async function getActiveStudentUniversities() {
  return (await readSheet<UniversityRow>("Universities"))
    .filter(row => activeValue(row.Is_Active) && row.University_Name.trim().toLowerCase() !== "intensive diploma")
    .map(row => ({ universityId: row.University_ID, universityName: row.University_Name, code: row.Code }));
}
