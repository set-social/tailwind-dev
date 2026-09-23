import type { SearchResult } from "../types";
import { AIRPORTS as A } from "./airports";

export const searchIndex: SearchResult[] = [
  { id: "s1", airline: "United", code: "UA 1482", origin: A.EWR, destination: A.LAX, depart: "6:45 PM", arrive: "9:52 PM", onTimePct: 74, outlook: { level: "watch", label: "Delay likely" }, daysLabel: "Daily" },
  { id: "s2", airline: "United", code: "UA 2091", origin: A.EWR, destination: A.LAX, depart: "8:20 PM", arrive: "11:31 PM", onTimePct: 81, outlook: { level: "good", label: "Looking smooth" }, daysLabel: "Daily" },
  { id: "s3", airline: "Delta", code: "DL 401", origin: A.EWR, destination: A.LAX, depart: "5:30 PM", arrive: "8:41 PM", onTimePct: 79, outlook: { level: "watch", label: "Some risk" }, daysLabel: "Daily" },
  { id: "s4", airline: "American", code: "AA 177", origin: A.JFK, destination: A.LAX, depart: "7:00 PM", arrive: "10:12 PM", onTimePct: 77, outlook: { level: "good", label: "Looking smooth" }, daysLabel: "Daily" },
  { id: "s5", airline: "Delta", code: "DL 1123", origin: A.EWR, destination: A.ATL, depart: "7:10 AM", arrive: "9:41 AM", onTimePct: 83, outlook: { level: "good", label: "Looking smooth" }, daysLabel: "Daily" },
  { id: "s6", airline: "Delta", code: "DL 2384", origin: A.ATL, destination: A.SFO, depart: "10:18 AM", arrive: "12:44 PM", onTimePct: 72, outlook: { level: "watch", label: "Some risk" }, daysLabel: "Daily" },
  { id: "s7", airline: "United", code: "UA 1845", origin: A.ORD, destination: A.EWR, depart: "2:42 PM", arrive: "5:20 PM", onTimePct: 68, outlook: { level: "risk", label: "Running late" }, daysLabel: "Daily" },
  { id: "s8", airline: "United", code: "UA 1531", origin: A.LAX, destination: A.EWR, depart: "10:05 PM", arrive: "6:20 AM", onTimePct: 91, outlook: { level: "good", label: "Looking smooth" }, daysLabel: "Daily" },
  { id: "s9", airline: "United", code: "UA 2210", origin: A.EWR, destination: A.BOS, depart: "8:30 AM", arrive: "9:43 AM", onTimePct: 76, outlook: { level: "good", label: "Looking smooth" }, daysLabel: "Mon–Fri" },
  { id: "s10", airline: "Alaska", code: "AS 24", origin: A.SEA, destination: A.SAN, depart: "9:15 AM", arrive: "12:02 PM", onTimePct: 88, outlook: { level: "good", label: "Looking smooth" }, daysLabel: "Daily" },
  { id: "s11", airline: "JetBlue", code: "B6 416", origin: A.JFK, destination: A.MIA, depart: "6:10 AM", arrive: "9:15 AM", onTimePct: 70, outlook: { level: "watch", label: "Some risk" }, daysLabel: "Daily" },
  { id: "s12", airline: "United", code: "UA 615", origin: A.DEN, destination: A.EWR, depart: "11:55 AM", arrive: "5:22 PM", onTimePct: 75, outlook: { level: "watch", label: "Some risk" }, daysLabel: "Daily" },
];

export const popularSearches = ["UA 1482", "EWR to LAX", "ATL", "Delta 401"];

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

export function searchFlights(query: string): SearchResult[] {
  const q = norm(query);
  if (!q) return [];
  const tokens = q.split(" ").filter((w) => w !== "to" && w !== "from" && w !== "flight");
  return searchIndex.filter((f) => {
    const hay = norm(
      `${f.airline} ${f.code} ${f.code.replace(" ", "")} ${f.origin.code} ${f.origin.city} ${f.origin.name} ${f.destination.code} ${f.destination.city} ${f.destination.name}`,
    );
    return tokens.every((tok) => hay.includes(tok));
  });
}
