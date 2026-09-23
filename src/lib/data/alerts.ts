import type { Alert } from "../types";

export const alerts: Alert[] = [
  {
    id: "a1", time: "3:42 PM", kind: "delay", level: "watch", unread: true,
    title: "Your delay risk climbed to 68%",
    body: "Your aircraft left Chicago 31 minutes late, and storms are building near Newark. United still lists UA 1482 as on time.",
    tripLabel: "UA 1482 · EWR → LAX",
    action: { label: "See why", href: "/flight/ua1482" },
  },
  {
    id: "a2", time: "3:20 PM", kind: "leave", level: "neutral", unread: true,
    title: "You can leave at 4:35 PM",
    body: "That gives you 20 minutes of spare time. If United confirms a delay, we'll let you leave later.",
    tripLabel: "UA 1482 · EWR → LAX",
    action: { label: "Leave plan", href: "/flight/ua1482" },
  },
  {
    id: "a3", time: "2:31 PM", kind: "gate", level: "neutral",
    title: "Gate changed to C74",
    body: "The new gate is closer to security. Your walking time dropped by 4 minutes.",
    tripLabel: "UA 1482 · EWR → LAX",
  },
  {
    id: "a4", time: "Yesterday", kind: "connection", level: "risk",
    title: "Your Atlanta connection is getting tight",
    body: "The first leg is scheduled to land 37 minutes before your next flight. You would likely have 27 minutes to reach Concourse E.",
    tripLabel: "DL 1123 → DL 2384 · Oct 14",
    action: { label: "Review trip", href: "/trips/ewr-sfo" },
  },
  {
    id: "a5", time: "Yesterday", kind: "good", level: "good",
    title: "Los Angeles looks smooth for your return",
    body: "There are no weather risks for UA 1531 next Sunday, and the flight has left on time 91% of the time this month.",
    tripLabel: "UA 1531 · LAX → EWR",
  },
  {
    id: "a6", time: "Sep 17", kind: "weather", level: "watch",
    title: "Fall storms may reach New York next weekend",
    body: "This is an early signal. We'll only alert you again if it affects one of your flights.",
    tripLabel: "Trips this month",
  },
];
