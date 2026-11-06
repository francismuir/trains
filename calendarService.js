// Google Calendar Integration Service for UK Rail Planner
// For each leg of a selected journey, provides 3 calendar entry options:
//
// 1. Departure Entry:
//    Title: Depart <departure station name> p<platform number>
//    Location: <the departure station>
//    Note: Train details describing the service e.g. Merseyrail from Southport to Liverpool Central
//    Notification: 10 minutes
//
// 2. Arrival Entry:
//    Title: Arrive <arrival station name> p<platform number>
//    Location: <the arrival station>
//    Notification: 5 minutes
//
// 3. Combined (Departure & Arrival in One Entry):
//    Title: Train from <departure station> to <arrival station>
//    Location: <the departure station>
//    Platforms: Depart <departure station> p<platform number> → Arrive <arrival station> p<platform number>
//    Note: <Train details describing the service> (Depart <departure station> p<platform>, Arrive <arrival station> p<platform>)
//    Notification: 10 minutes

(function () {
  // Convert a journey into its calendar entries (3 options per leg: Departure, Arrival, and Combined)
  function buildCalendarEntriesForJourney(journey) {
    const entries = [];
    (journey.legs || []).forEach((leg) => {
      const depStart = new Date(leg.departureDateTimeISO);
      const depEnd = new Date(depStart.getTime() + 5 * 60000);

      // 1. Leg Departure Entry
      entries.push({
        id: `${journey.id}-leg${leg.legNumber}-dep`,
        legNumber: leg.legNumber,
        entryType: "Departure",
        title: `Depart ${leg.fromStation} p${leg.departurePlatform}`,
        location: leg.fromStation,
        platformsText: `p${leg.departurePlatform}`,
        note: leg.serviceDetails, // e.g. "Merseyrail from Southport to Liverpool Central"
        notificationMinutes: 10,
        dateStr: leg.departureDate,
        timeStr: leg.departureTime,
        startDateTime: depStart,
        endDateTime: depEnd
      });

      const arrStart = new Date(leg.arrivalDateTimeISO);
      const arrEnd = new Date(arrStart.getTime() + 5 * 60000);

      // 2. Leg Arrival Entry
      entries.push({
        id: `${journey.id}-leg${leg.legNumber}-arr`,
        legNumber: leg.legNumber,
        entryType: "Arrival",
        title: `Arrive ${leg.toStation} p${leg.arrivalPlatform}`,
        location: leg.toStation,
        platformsText: `p${leg.arrivalPlatform}`,
        note: "",
        notificationMinutes: 5,
        dateStr: leg.arrivalDate,
        timeStr: leg.arrivalTime,
        startDateTime: arrStart,
        endDateTime: arrEnd
      });

      // 3. Combined Departure & Arrival Entry (single event spanning from departure to arrival)
      const platformsSummary = `Depart ${leg.fromStation} p${leg.departurePlatform} → Arrive ${leg.toStation} p${leg.arrivalPlatform}`;
      const combinedNote = `${leg.serviceDetails}\nDepart ${leg.fromStation} p${leg.departurePlatform} (${leg.departureTime})\nArrive ${leg.toStation} p${leg.arrivalPlatform} (${leg.arrivalTime})`;

      entries.push({
        id: `${journey.id}-leg${leg.legNumber}-combined`,
        legNumber: leg.legNumber,
        entryType: "Combined (Depart & Arrive)",
        title: `Train from ${leg.fromStation} to ${leg.toStation}`,
        location: `${leg.fromStation} (p${leg.departurePlatform}) to ${leg.toStation} (p${leg.arrivalPlatform})`,
        platformsText: platformsSummary,
        trainInfo: leg.serviceDetails,
        note: combinedNote,
        notificationMinutes: 10,
        dateStr: leg.departureDate,
        timeStr: `${leg.departureTime} – ${leg.arrivalTime}`,
        startDateTime: depStart,
        endDateTime: arrStart
      });
    });

    return entries;
  }

  // Format Date to UTC YYYYMMDDTHHMMSSZ for Google Calendar URLs & ICS
  function toGoogleUtcTimestamp(dateObj) {
    return dateObj.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  }

  // Build a Google Calendar Web Template URL (uses active Google login in browser)
  function buildGoogleCalendarTemplateUrl(entry) {
    const dates = `${toGoogleUtcTimestamp(entry.startDateTime)}/${toGoogleUtcTimestamp(entry.endDateTime)}`;
    const params = [
      `action=TEMPLATE`,
      `text=${encodeURIComponent(entry.title)}`,
      `dates=${encodeURIComponent(dates)}`,
      `location=${encodeURIComponent(entry.location)}`
    ];
    if (entry.note) {
      params.push(`details=${encodeURIComponent(entry.note)}`);
    }
    return `https://calendar.google.com/calendar/render?${params.join("&")}`;
  }

  // Escape ICS text fields
  function escapeIcsText(str) {
    return String(str || "")
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\n/g, "\\n");
  }

  // Generate an RFC 5545 .ics calendar file containing leg Departure & Arrival events
  function generateIcsContent(journey) {
    const entries = buildCalendarEntriesForJourney(journey).filter(
      (e) => e.entryType === "Departure" || e.entryType === "Arrival"
    );
    const nowStamp = toGoogleUtcTimestamp(new Date());

    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//UK Rail Trip Planner//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH"
    ];

    entries.forEach((entry) => {
      lines.push("BEGIN:VEVENT");
      lines.push(`UID:${entry.id}@ukrailtripplanner.local`);
      lines.push(`DTSTAMP:${nowStamp}`);
      lines.push(`DTSTART:${toGoogleUtcTimestamp(entry.startDateTime)}`);
      lines.push(`DTEND:${toGoogleUtcTimestamp(entry.endDateTime)}`);
      lines.push(`SUMMARY:${escapeIcsText(entry.title)}`);
      lines.push(`LOCATION:${escapeIcsText(entry.location)}`);
      if (entry.note) {
        lines.push(`DESCRIPTION:${escapeIcsText(entry.note)}`);
      }
      lines.push("BEGIN:VALARM");
      lines.push(`TRIGGER:-PT${entry.notificationMinutes}M`);
      lines.push("ACTION:DISPLAY");
      lines.push(`DESCRIPTION:${escapeIcsText(entry.title)}`);
      lines.push("END:VALARM");
      lines.push("END:VEVENT");
    });

    lines.push("END:VCALENDAR");
    return lines.join("\r\n");
  }

  function downloadJourneyIcs(journey) {
    const ics = generateIcsContent(journey);
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `uk-rail-${journey.originCrs}-to-${journey.destinationCrs}-${journey.departureDate}-${journey.departureTime.replace(":", "")}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  window.CalendarService = {
    buildCalendarEntriesForJourney,
    buildGoogleCalendarTemplateUrl,
    downloadJourneyIcs
  };
})();
