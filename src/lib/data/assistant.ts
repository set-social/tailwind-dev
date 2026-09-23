export interface AssistantAnswer {
  answer: string[];
  basedOn: string[];
  follow?: string;
}

/** Canned answers keyed by question. A real model would replace `answerFor`. */
const answers: Record<string, AssistantAnswer> = {
  "Why does FlightIQ think my flight will be delayed?": {
    answer: [
      "Mostly because of your aircraft. The plane that will fly you to Los Angeles is coming from Chicago and landed 38 minutes behind schedule. Even a fast turnaround takes about an hour, and it will only have 47 minutes.",
      "Storms near Newark from 5:30 to 7:30 PM add to that. In similar situations, this flight left more than 30 minutes late about two out of three times.",
    ],
    basedOn: ["Inbound aircraft UA 1845", "EWR weather forecast", "Last 100 days of UA 1482"],
    follow: "Should I leave for the airport later?",
  },
  "Could United swap the aircraft?": {
    answer: [
      "It's possible. A Boeing 737-900ER (N27213) is parked at gate C71 and isn't scheduled to fly until 8:30 PM. Swapping would keep your flight close to on time.",
      "FlightIQ puts the chance at about 24%. Airlines usually wait until a delay is clearer before swapping. If the storms pause departures, that odds could rise.",
    ],
    basedOn: ["Spare aircraft at EWR", "United's past swap behavior"],
  },
  "Should I leave for the airport later?": {
    answer: [
      "Not yet. United still shows on time, and the roads near the Meadowlands get slower after 5 PM. Leaving at 4:35 PM keeps you safe either way.",
      "If United confirms a 40-minute delay, you could leave around 5:15 PM. FlightIQ will tell you the moment that changes.",
    ],
    basedOn: ["Traffic on Route 3", "Delay forecast", "Your 20-min arrival buffer"],
  },
  "What happens if this gets cancelled?": {
    answer: [
      "Cancellation looks unlikely right now, at about 4%. If it happens, United's next nonstop to Los Angeles leaves at 8:20 PM and still has seats.",
      "FlightIQ would alert you before the airline's own notice in most cases, so you could rebook first.",
    ],
    basedOn: ["Cancellation history", "UA 2091 seat availability"],
  },
  "What happens if I miss my connection?": {
    answer: [
      "On your October 14 trip, the next Delta flight from Atlanta to San Francisco leaves at 1:05 PM. You would have about a 2h 45m wait, and Delta would rebook you at no cost.",
      "FlightIQ puts the chance of missing it at 41% today.",
    ],
    basedOn: ["Connection walking time", "Delta ATL to SFO schedule"],
  },
};

export const fallbackAnswer: AssistantAnswer = {
  answer: [
    "I don't have a confident answer to that yet. I can explain the delay forecast, the aircraft, or when to leave for the airport.",
  ],
  basedOn: ["UA 1482 signals"],
};

export function answerFor(q: string): AssistantAnswer {
  if (answers[q]) return answers[q];
  const l = q.toLowerCase();
  if (l.includes("swap") || l.includes("aircraft")) return answers["Could United swap the aircraft?"];
  if (l.includes("leave") || l.includes("when")) return answers["Should I leave for the airport later?"];
  if (l.includes("why") || l.includes("delay")) return answers["Why does FlightIQ think my flight will be delayed?"];
  if (l.includes("cancel")) return answers["What happens if this gets cancelled?"];
  if (l.includes("connection") || l.includes("miss")) return answers["What happens if I miss my connection?"];
  return fallbackAnswer;
}
