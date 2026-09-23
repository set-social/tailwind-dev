import { t } from "../utils";
import type { FlightDetail } from "../types";
import { AIRPORTS } from "./airports";

/** The mock "now" the whole prototype is anchored to: Sunday, 3:58 PM ET. */
export const NOW = t(15, 58);

export const ua1482: FlightDetail = {
  flight: {
    id: "ua1482",
    airline: "United Airlines",
    code: "UA 1482",
    date: "Today · Sun, Sep 20",
    origin: AIRPORTS.EWR,
    destination: AIRPORTS.LAX,
    depart: t(18, 45),
    arrive: t(21, 52),
    durationMin: 367,
    boardingStart: t(18, 15),
    terminal: "C",
    gate: "C74",
    aircraft: "Boeing 737 MAX 9",
    airlineStatus: {
      label: "On Time",
      level: "good",
      detail: "United hasn't posted a delay. Last updated 3:40 PM.",
    },
    forecast: {
      probability: 68,
      thresholdMin: 30,
      label: "Moderate delay risk",
      level: "watch",
      confidence: "Medium",
      distribution: [
        { label: "On time", pct: 14 },
        { label: "15–30 min", pct: 18 },
        { label: "30–60 min", pct: 41 },
        { label: "60+ min", pct: 27 },
      ],
      likelyDeparture: { from: t(19, 15), to: t(19, 50) },
      trend: [31, 33, 36, 42, 44, 51, 58, 68],
    },
    stages: [
      { id: "scheduled", label: "Scheduled", state: "done", note: "Booked" },
      { id: "inbound", label: "Inbound aircraft", state: "current", note: "En route from Chicago" },
      { id: "gate", label: "At gate", state: "upcoming", note: "~5:58 PM" },
      { id: "boarding", label: "Boarding", state: "upcoming", note: "~6:50 PM" },
      { id: "departed", label: "Departed", state: "upcoming" },
      { id: "inflight", label: "In flight", state: "upcoming" },
      { id: "landed", label: "Landed", state: "upcoming" },
    ],
  },

  intelligence: {
    headline: "Listed on time — but unlikely to leave on time.",
    summary:
      "United currently reports this flight on time. However, your inbound aircraft is running 38 minutes late and thunderstorms are developing west of Newark. TailWind currently estimates a 68% chance of a departure delay greater than 30 minutes.",
    updatedAt: t(15, 42),
    suggested: [
      "Why does TailWind think my flight will be delayed?",
      "Could United swap the aircraft?",
      "Should I leave for the airport later?",
      "What happens if this gets cancelled?",
    ],
    signals: [
      {
        id: "inbound",
        icon: "plane",
        label: "Inbound aircraft",
        value: "Running 38 min late",
        detail: "It needs about 65 minutes on the ground to be ready. It will have 47.",
        level: "risk",
        weight: 46,
      },
      {
        id: "weather",
        icon: "cloud",
        label: "Weather",
        value: "Moderate disruption risk",
        detail: "Thunderstorms near Newark from 5:30 to 7:30 PM.",
        level: "watch",
        weight: 28,
      },
      {
        id: "congestion",
        icon: "building",
        label: "Airport congestion",
        value: "Increasing",
        detail: "Departures are stacking up between 6 and 8 PM.",
        level: "watch",
        weight: 14,
      },
      {
        id: "history",
        icon: "history",
        label: "Historical performance",
        value: "74% on time",
        detail: "This flight left within 15 min on 74 of the last 100 days.",
        level: "neutral",
        weight: 8,
      },
      {
        id: "swap",
        icon: "swap",
        label: "Aircraft swap",
        value: "Possible",
        detail: "A spare 737 is parked at EWR. About a 1 in 4 chance United uses it.",
        level: "good",
        weight: 4,
      },
    ],
  },

  aircraft: {
    type: "Boeing 737 MAX 9",
    tail: "N17264",
    operating: { code: "UA 1845", from: "ORD", to: "EWR", fromCity: "Chicago" },
    position: "Over northern Indiana · 34,000 ft",
    altitudeFt: 34000,
    groundSpeedKts: 478,
    progress: 0.12,
    departedLate: 31,
    scheduledArrival: t(17, 20),
    estimatedArrival: t(17, 58),
    scheduledTurnaround: 85,
    estimatedTurnaround: 47,
    requiredTurnaround: 65,
    verdict: {
      level: "risk",
      title: "Unlikely to make your departure on time",
      detail:
        "The aircraft lands 38 minutes late and needs roughly 65 minutes to unload, clean and reboard. That puts your earliest realistic pushback near 7:03 PM.",
    },
    swap: {
      probability: 24,
      tail: "N27213",
      type: "Boeing 737-900ER",
      location: "Gate C71, parked until 8:30 PM",
      detail:
        "A same-size aircraft is idle at Newark. United swaps aircraft when a delay would ripple across the evening, but it isn't the usual choice this early.",
    },
  },

  leave: {
    originLabel: "Hoboken, NJ",
    components: [
      { id: "drive", label: "Drive to EWR", minutes: 42, note: "Route 3 slows near the Meadowlands after 5:00 PM.", icon: "car" },
      { id: "parking", label: "Parking / drop-off", minutes: 10, note: "Terminal C garage is filling up.", icon: "parking" },
      { id: "security", label: "Security", minutes: 18, note: "TSA PreCheck line, evening peak.", icon: "shield" },
      { id: "walk", label: "Walk to gate", minutes: 9, note: "Gate C74, past the food court.", icon: "walk" },
      { id: "buffer", label: "Recommended buffer", minutes: 20, note: "Your preferred arrival cushion.", icon: "buffer" },
    ],
    scenarios: [
      { id: "scheduled", label: "As scheduled", delayMin: 0, hint: "United's current time" },
      { id: "forecast", label: "Forecast", delayMin: 40, hint: "Most likely outcome" },
      { id: "long", label: "Long delay", delayMin: 75, hint: "Storms hold departures" },
    ],
  },

  weather: {
    origin: {
      code: "EWR",
      city: "Newark",
      focusLabel: "Around 6:45 PM departure",
      temp: 79,
      condition: "storm",
      summary: "Thunderstorms likely",
      hours: [
        { label: "4 PM", temp: 82, condition: "partly", precip: 10 },
        { label: "5 PM", temp: 80, condition: "cloud", precip: 30 },
        { label: "6 PM", temp: 78, condition: "storm", precip: 70 },
        { label: "7 PM", temp: 76, condition: "storm", precip: 65 },
        { label: "8 PM", temp: 74, condition: "rain", precip: 35 },
        { label: "9 PM", temp: 73, condition: "cloud", precip: 15 },
      ],
      operational: {
        level: "watch",
        title: "Thunderstorms may affect departures between 5:30–7:30 PM",
        detail: "Storms slow ground crews and can pause departures for 30–60 minutes at a time.",
      },
    },
    destination: {
      code: "LAX",
      city: "Los Angeles",
      focusLabel: "Around 9:52 PM arrival",
      temp: 67,
      condition: "clear",
      summary: "Clear and calm",
      hours: [
        { label: "7 PM", temp: 72, condition: "clear", precip: 0 },
        { label: "8 PM", temp: 70, condition: "clear", precip: 0 },
        { label: "9 PM", temp: 68, condition: "clear", precip: 0 },
        { label: "10 PM", temp: 67, condition: "partly", precip: 0 },
        { label: "11 PM", temp: 65, condition: "partly", precip: 5 },
      ],
    },
  },

  events: [
    {
      id: "e1", time: t(15, 42), kind: "aircraft",
      title: "Inbound aircraft departed Chicago 31 min late",
      detail: "UA 1845 pushed back at 3:13 PM CT rather than 2:42 PM CT.",
    },
    {
      id: "e2", time: t(15, 18), kind: "risk",
      title: "Delay risk increased",
      detail: "The late inbound aircraft now leaves a short turnaround.",
      delta: { from: 42, to: 68 },
    },
    {
      id: "e3", time: t(14, 55), kind: "weather",
      title: "Thunderstorm probability increased near EWR",
      detail: "A line of storms is moving east across Pennsylvania.",
    },
    {
      id: "e4", time: t(14, 31), kind: "gate",
      title: "Gate changed C82 → C74",
      detail: "The new gate is 4 minutes closer to security.",
    },
    {
      id: "e5", time: t(12, 5), kind: "status",
      title: "Flight confirmed on time by United",
      detail: "No irregular operations reported for the aircraft or the crew.",
    },
  ],
};
