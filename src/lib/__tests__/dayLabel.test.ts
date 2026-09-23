import { relativeDay } from "../dayLabel";

// 2026-09-23 18:00 UTC = 1:00 PM in Fayetteville (CDT), 2:00 PM in Newark (EDT).
const NOW = new Date("2026-09-23T18:00:00Z");

describe("relativeDay", () => {
  it("calls the next calendar day at the airport 'Tomorrow'", () => {
    const r = relativeDay("2026-09-24T19:53:00Z", "America/Chicago", NOW);
    expect(r?.label).toBe("Tomorrow");
    expect(r?.offset).toBe(1);
    expect(r?.date).toBe("Thu, Sep 24");
  });

  it("calls a later time the same local day 'Today'", () => {
    expect(relativeDay("2026-09-23T23:00:00Z", "America/Chicago", NOW)?.label).toBe("Today");
  });

  it("judges the day at the airport, not in UTC", () => {
    // 2026-09-24 02:30 UTC is still 9:30 PM on Sep 23 in Chicago.
    expect(relativeDay("2026-09-24T02:30:00Z", "America/Chicago", NOW)?.label).toBe("Today");
    // ...but already Sep 24 in UTC.
    expect(relativeDay("2026-09-24T02:30:00Z", "UTC", NOW)?.label).toBe("Tomorrow");
  });

  it("falls back to the weekday and date beyond tomorrow, and says Yesterday for the past", () => {
    expect(relativeDay("2026-09-26T15:00:00Z", "America/Chicago", NOW)?.label).toBe("Sat, Sep 26");
    expect(relativeDay("2026-09-22T15:00:00Z", "America/Chicago", NOW)?.label).toBe("Yesterday");
  });

  it("returns null for missing or invalid input and tolerates a bad timezone", () => {
    expect(relativeDay(null, "UTC", NOW)).toBeNull();
    expect(relativeDay("nope", "UTC", NOW)).toBeNull();
    expect(relativeDay("2026-09-24T19:53:00Z", "Not/AZone", NOW)).not.toBeNull();
  });
});
