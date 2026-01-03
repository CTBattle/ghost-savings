export type ISODate = string; // "2026-01-02"

export function daysBetween(a: ISODate, b: ISODate): number {
  const da = new Date(a + "T00:00:00Z").getTime();
  const db = new Date(b + "T00:00:00Z").getTime();
  return Math.floor((db - da) / (1000 * 60 * 60 * 24));
}

export function isBefore(a: ISODate, b: ISODate): boolean {
  return new Date(a + "T00:00:00Z").getTime() < new Date(b + "T00:00:00Z").getTime();
}

export function addDays(date: ISODate, days: number): ISODate {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
