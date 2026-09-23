import type { Profile } from "../types";

export const profile: Profile = {
  name: "Maya Chen",
  homeAirport: "EWR",
  arrivalBuffer: 20,
  preCheck: true,
  clear: false,
  checkedBags: 1,
  transport: "drive",
  tempUnit: "F",
  notifications: [
    { id: "delay", label: "Delay forecasts", description: "When risk for a flight changes meaningfully.", enabled: true },
    { id: "leave", label: "Time to leave", description: "When it's time to head to the airport, or safe to wait.", enabled: true },
    { id: "connection", label: "Connection risk", description: "When a transfer gets tight or improves.", enabled: true },
    { id: "gate", label: "Gate and terminal changes", description: "As soon as the airport posts them.", enabled: true },
    { id: "weather", label: "Weather that matters", description: "Only when it affects your flight.", enabled: false },
  ],
};
