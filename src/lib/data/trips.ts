import { t } from "../utils";
import type { Trip } from "../types";
import { AIRPORTS as A } from "./airports";

export const trips: Trip[] = [
  {
    id: "ewr-lax",
    title: "Newark to Los Angeles",
    dateLabel: "Today · Sun, Sep 20",
    daysAway: 0,
    flightId: "ua1482",
    outlook: { level: "watch", label: "Delay likely" },
    connections: [],
    legs: [
      {
        code: "UA 1482", airline: "United Airlines", origin: A.EWR, destination: A.LAX,
        depart: t(18, 45), arrive: t(21, 52), aircraft: "Boeing 737 MAX 9", terminal: "C", gate: "C74",
        status: { label: "On time", level: "good" },
      },
    ],
  },
  {
    id: "ewr-sfo",
    title: "Newark to San Francisco",
    dateLabel: "Wed, Oct 14 · via Atlanta",
    daysAway: 24,
    outlook: { level: "risk", label: "Tight connection" },
    connections: [
      {
        airport: "Atlanta",
        scheduledMin: 37,
        expectedMin: 27,
        walkMin: 14,
        gateFrom: "B22",
        gateTo: "E5",
        risk: 41,
        level: "risk",
        advice:
          "You would have about 27 minutes to reach Concourse E, and it includes a train ride. If the first flight lands after 9:55 AM, this connection is likely to fail. TailWind will keep watching it and propose a backup as the day gets closer.",
      },
    ],
    legs: [
      {
        code: "DL 1123", airline: "Delta Air Lines", origin: A.EWR, destination: A.ATL,
        depart: t(7, 10), arrive: t(9, 41), aircraft: "Airbus A321", terminal: "A", gate: "A12",
        status: { label: "Scheduled", level: "neutral" },
      },
      {
        code: "DL 2384", airline: "Delta Air Lines", origin: A.ATL, destination: A.SFO,
        depart: t(10, 18), arrive: t(12, 44), aircraft: "Boeing 757-300", gate: "E5",
        status: { label: "Scheduled", level: "neutral" },
      },
    ],
  },
  {
    id: "lax-ewr",
    title: "Los Angeles to Newark",
    dateLabel: "Sun, Sep 27",
    daysAway: 7,
    outlook: { level: "good", label: "Looking smooth" },
    connections: [],
    legs: [
      {
        code: "UA 1531", airline: "United Airlines", origin: A.LAX, destination: A.EWR,
        depart: t(22, 5), arrive: t(6, 20), aircraft: "Boeing 787-9",
        status: { label: "Scheduled", level: "neutral" },
      },
    ],
  },
  {
    id: "ewr-bos",
    title: "Newark to Boston",
    dateLabel: "Fri, Nov 6",
    daysAway: 47,
    outlook: { level: "good", label: "Looking smooth" },
    connections: [],
    legs: [
      {
        code: "UA 2210", airline: "United Airlines", origin: A.EWR, destination: A.BOS,
        depart: t(8, 30), arrive: t(9, 43), aircraft: "Airbus A320", status: { label: "Scheduled", level: "neutral" },
      },
    ],
  },
];
