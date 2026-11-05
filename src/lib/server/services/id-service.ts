import "server-only";

export function nextId(values: string[], pattern: RegExp, format: (sequence: number) => string) {
  const highest = values.reduce((max, value) => { const match = value.match(pattern); return match ? Math.max(max, Number(match[1])) : max; }, 0);
  for (let sequence = highest + 1; sequence <= highest + 10; sequence++) {
    const candidate = format(sequence);
    if (!values.includes(candidate)) return candidate;
  }
  throw new Error("Unable to generate a unique sequential ID");
}

export const nextStudentId = (values: string[]) => nextId(values, /^TT_2026_(\d+)$/, sequence => `TT_2026_${String(sequence).padStart(5, "0")}`);
export const nextEnrollmentId = (values: string[]) => nextId(values, /^ENR_(\d+)$/, sequence => `ENR_${String(sequence).padStart(5, "0")}`);
export const nextPaymentId = (values: string[]) => nextId(values, /^PAY_2026_(\d+)$/, sequence => `PAY_2026_${String(sequence).padStart(7, "0")}`);
