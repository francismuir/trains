// UK Rail Journey Search Service
// Scrapes live UK rail journeys (including multi-leg changes, platforms, and train service descriptions)
// directly from https://traintimes.org.uk/<ORIGIN>/<DEST>/<TIME>[a]/<D%20MMM%20YYYY>

(function () {
  const STATION_MAP = new Map();
  (window.UK_STATIONS || []).forEach((s) => {
    STATION_MAP.set(s.crs, s);
  });

  const MONTH_NAMES = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ];

  function getStationByCrs(crs) {
    if (!crs) return { crs: "", name: "", region: "United Kingdom", toc: "National Rail" };
    const upper = String(crs).trim().toUpperCase();
    return (
      STATION_MAP.get(upper) || {
        crs: upper,
        name: upper,
        region: "United Kingdom",
        hub: "EUS",
        toc: "National Rail",
        line: "wcml"
      }
    );
  }

  function parseDateTime(dateStr, timeStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const [hh, mm] = (timeStr || "00:00").split(":").map(Number);
    return new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0);
  }

  function addMinutes(dateObj, mins) {
    return new Date(dateObj.getTime() + mins * 60000);
  }

  function formatTimeHHMM(dateObj) {
    const hh = String(dateObj.getHours()).padStart(2, "0");
    const mm = String(dateObj.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }

  function formatDateYYYYMMDD(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, "0");
    const d = String(dateObj.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // Format YYYY-MM-DD into "7 Nov 2026" for traintimes.org.uk URL
  function formatDateForTraintimes(yyyyMmDd) {
    const [y, m, d] = yyyyMmDd.split("-").map(Number);
    const monthStr = MONTH_NAMES[(m || 1) - 1] || "Jan";
    return `${d} ${monthStr} ${y}`;
  }

  function formatDuration(totalMinutes) {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h <= 0) return `${Math.max(1, m)}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  }

  function decodeHtmlEntities(str) {
    return String(str || "")
      .replace(/&amp;/g, "&")
      .replace(/&ndash;/g, "–")
      .replace(/&middot;/g, "·")
      .replace(/&pound;/g, "£")
      .replace(/&#039;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
  }

  // Parse query string with array parameters like legs[] and info[]
  function parseQueryParams(href) {
    const decodedHref = decodeHtmlEntities(href);
    const qIdx = decodedHref.indexOf("?");
    if (qIdx === -1) return {};
    const queryStr = decodedHref.slice(qIdx + 1);
    const result = {};

    queryStr.split("&").forEach((pair) => {
      if (!pair) return;
      const eqIdx = pair.indexOf("=");
      const rawKey = eqIdx === -1 ? pair : pair.slice(0, eqIdx);
      const rawVal = eqIdx === -1 ? "" : pair.slice(eqIdx + 1);
      const key = decodeURIComponent(rawKey.replace(/\+/g, " "));
      const val = decodeURIComponent(rawVal.replace(/\+/g, " "));

      if (key.endsWith("[]")) {
        if (!result[key]) result[key] = [];
        result[key].push(val);
      } else {
        result[key] = val;
      }
    });

    return result;
  }

  // Build the exact https://traintimes.org.uk/ URL
  // Example: https://traintimes.org.uk/WLO/MCO/10:00/7%20Nov%202026
  // Or for arrival time: https://traintimes.org.uk/WLO/MCO/11:00a/7%20Nov%202026
  function buildTraintimesUrl({ originCrs, destinationCrs, dateStr, timeStr, timeMode }) {
    const timeSegment = timeMode === "arrival" ? `${timeStr}a` : timeStr;
    const dateFormatted = formatDateForTraintimes(dateStr);
    return `https://traintimes.org.uk/${encodeURIComponent(originCrs)}/${encodeURIComponent(destinationCrs)}/${timeSegment}/${encodeURIComponent(dateFormatted)}`;
  }

  // Parse the HTML returned by https://traintimes.org.uk/
  // Extracts both direct journeys and multi-leg journeys (from the embedded <div class="nojs-changes"> table)
  function parseTraintimesHtml(rawHtml, originCrs, destinationCrs, fallbackDateStr) {
    if (!rawHtml) return [];

    const ulIdx = rawHtml.indexOf('<ul class="results">');
    if (ulIdx === -1) return [];

    const ulSlice = rawHtml.slice(ulIdx);
    const liChunks = ulSlice.split(/<li id="result\d+">/).slice(1);
    const journeys = [];

    for (let jIdx = 0; jIdx < liChunks.length && journeys.length < 5; jIdx++) {
      const chunk = liChunks[jIdx];

      // 1. Parse top-level summary line (before first <br>)
      const brIdx = chunk.indexOf("<br>");
      const topLine = brIdx !== -1 ? chunk.slice(0, brIdx) : chunk;

      const strongMatch = topLine.match(
        /<strong>\s*(\d{2}:\d{2})\s*(?:&ndash;|–|-)\s*(\d{2}:\d{2})\s*<\/strong>/
      );
      if (!strongMatch) continue;

      const topDepTime = strongMatch[1];
      const topArrTime = strongMatch[2];
      const strongStartIdx = topLine.indexOf(strongMatch[0]);
      const strongEndIdx = strongStartIdx + strongMatch[0].length;

      const beforeStrong = topLine.slice(0, strongStartIdx);
      const afterStrong = topLine.slice(strongEndIdx);

      const depPlatMatch = beforeStrong.match(
        /<span class=['"]platform['"]>(?:<span[^>]*>.*?<\/span>)?\s*([^<]+)<\/span>/i
      );
      const arrPlatMatch = afterStrong.match(
        /<span class=['"]platform['"]>(?:<span[^>]*>.*?<\/span>)?\s*([^<]+)<\/span>/i
      );

      const topDepPlat = depPlatMatch ? depPlatMatch[1].trim() : "TBC";
      const topArrPlat = arrPlatMatch ? arrPlatMatch[1].trim() : "TBC";

      // 2. Check if this journey has multiple legs (<div class="nojs-changes">)
      const changesMatch = chunk.match(
        /<div class="nojs-changes"[^>]*>([\s\S]*?)<\/tbody>\s*<\/table>\s*<\/div>\s*<\/div>/i
      );

      const legs = [];

      if (changesMatch) {
        const tableHtml = changesMatch[1];
        const rowMatches = tableHtml.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];

        let legCounter = 0;
        rowMatches.forEach((rowHtml) => {
          // Only include train legs (rows that have calling_link_inner)
          const callMatch = rowHtml.match(/class="calling_link_inner"\s+href="([^"]+)"/i);
          if (!callMatch) return;

          legCounter += 1;
          const qs = parseQueryParams(callMatch[1]);
          const stageIdx = Math.max(0, Number(qs.stage || legCounter) - 1);
          const legsArr = qs["legs[]"] || [];
          const infoArr = qs["info[]"] || [];
          const opsArr = qs["ops[]"] || [];

          const legSpec = legsArr[stageIdx] || "";
          const specParts = legSpec.split("|");
          const legFromCrs = specParts[0] || originCrs;
          const legToCrs = specParts[1] || destinationCrs;
          const depIsoRaw = specParts[2] || "";
          const arrIsoRaw = specParts[3] || "";

          const depDateStr = depIsoRaw.length >= 10 ? depIsoRaw.slice(0, 10) : fallbackDateStr;
          const depTimeStr = depIsoRaw.length >= 16 ? depIsoRaw.slice(11, 16) : topDepTime;
          const arrDateStr = arrIsoRaw.length >= 10 ? arrIsoRaw.slice(0, 10) : fallbackDateStr;
          const arrTimeStr = arrIsoRaw.length >= 16 ? arrIsoRaw.slice(11, 16) : topArrTime;

          // Extract origin & destination cell names and platform numbers
          const origCellMatch = rowHtml.match(
            /<td class=['"]origin['"]>\s*<a[^>]*>([^<]+)<\/a>(?:<br>\s*Platform\s*([^<]+))?\s*<\/td>/i
          );
          const destCellMatch = rowHtml.match(
            /<td class=['"]destination['"]>\s*<a[^>]*>([^<]+)<\/a>(?:<br>\s*Platform\s*([^<]+))?\s*<\/td>/i
          );

          const knownFrom = getStationByCrs(legFromCrs);
          const knownTo = getStationByCrs(legToCrs);

          const fromStationName =
            knownFrom && knownFrom.name !== legFromCrs
              ? knownFrom.name
              : origCellMatch
              ? decodeHtmlEntities(origCellMatch[1].trim())
              : legFromCrs;

          const toStationName =
            knownTo && knownTo.name !== legToCrs
              ? knownTo.name
              : destCellMatch
              ? decodeHtmlEntities(destCellMatch[1].trim())
              : legToCrs;

          let depPlatform =
            origCellMatch && origCellMatch[2] ? origCellMatch[2].trim() : "";
          if (!depPlatform && legCounter === 1 && topDepPlat !== "TBC") {
            depPlatform = topDepPlat;
          }
          if (!depPlatform) depPlatform = "TBC";

          let arrPlatform =
            destCellMatch && destCellMatch[2] ? destCellMatch[2].trim() : "";
          if (!arrPlatform) arrPlatform = "TBC";

          const depDt = parseDateTime(depDateStr, depTimeStr);
          let arrDt = parseDateTime(arrDateStr, arrTimeStr);
          if (arrDt < depDt) {
            arrDt = addMinutes(arrDt, 24 * 60);
          }
          const durationMins = Math.max(1, Math.round((arrDt - depDt) / 60000));

          const operatorName = opsArr[stageIdx] || "National Rail";
          const serviceNote =
            infoArr[stageIdx] || `${operatorName} from ${fromStationName} to ${toStationName}`;

          legs.push({
            legNumber: legCounter,
            fromStation: fromStationName,
            fromCrs: legFromCrs,
            toStation: toStationName,
            toCrs: legToCrs,
            departureDate: formatDateYYYYMMDD(depDt),
            departureTime: formatTimeHHMM(depDt),
            departureDateTimeISO: depDt.toISOString(),
            departurePlatform: depPlatform,
            arrivalDate: formatDateYYYYMMDD(arrDt),
            arrivalTime: formatTimeHHMM(arrDt),
            arrivalDateTimeISO: arrDt.toISOString(),
            arrivalPlatform: arrPlatform,
            operator: operatorName,
            serviceDetails: serviceNote,
            durationMinutes: durationMins,
            durationFormatted: formatDuration(durationMins)
          });
        });

        // If the last leg arrival platform wasn't in the cell but was on the summary line, apply it
        if (legs.length > 0 && legs[legs.length - 1].arrivalPlatform === "TBC" && topArrPlat !== "TBC") {
          legs[legs.length - 1].arrivalPlatform = topArrPlat;
        }
      } else {
        // Direct (1-leg) journey
        const callMatch = chunk.match(/class="calling_link"\s+href="([^"]+)"/i);
        const qs = callMatch ? parseQueryParams(callMatch[1]) : {};

        const legFromCrs = qs.from || originCrs;
        const legToCrs = qs.to || destinationCrs;
        const depIsoRaw = qs.depart || "";
        const arrIsoRaw = qs.arrive || "";

        const depDateStr = depIsoRaw.length >= 10 ? depIsoRaw.slice(0, 10) : fallbackDateStr;
        const depTimeStr = depIsoRaw.length >= 16 ? depIsoRaw.slice(11, 16) : topDepTime;
        const arrDateStr = arrIsoRaw.length >= 10 ? arrIsoRaw.slice(0, 10) : fallbackDateStr;
        const arrTimeStr = arrIsoRaw.length >= 16 ? arrIsoRaw.slice(11, 16) : topArrTime;

        const knownFrom = getStationByCrs(legFromCrs);
        const knownTo = getStationByCrs(legToCrs);

        const depDt = parseDateTime(depDateStr, depTimeStr);
        let arrDt = parseDateTime(arrDateStr, arrTimeStr);
        if (arrDt < depDt) {
          arrDt = addMinutes(arrDt, 24 * 60);
        }
        const durationMins = Math.max(1, Math.round((arrDt - depDt) / 60000));

        const infoArr = qs["info[]"] || [];
        const opsArr = qs["ops[]"] || [];
        const operatorName = opsArr[0] || "National Rail";
        const serviceNote =
          infoArr[0] || `${operatorName} from ${knownFrom.name} to ${knownTo.name}`;

        legs.push({
          legNumber: 1,
          fromStation: knownFrom.name,
          fromCrs: legFromCrs,
          toStation: knownTo.name,
          toCrs: legToCrs,
          departureDate: formatDateYYYYMMDD(depDt),
          departureTime: formatTimeHHMM(depDt),
          departureDateTimeISO: depDt.toISOString(),
          departurePlatform: topDepPlat,
          arrivalDate: formatDateYYYYMMDD(arrDt),
          arrivalTime: formatTimeHHMM(arrDt),
          arrivalDateTimeISO: arrDt.toISOString(),
          arrivalPlatform: topArrPlat,
          operator: operatorName,
          serviceDetails: serviceNote,
          durationMinutes: durationMins,
          durationFormatted: formatDuration(durationMins)
        });
      }

      if (legs.length === 0) continue;

      const firstLeg = legs[0];
      const lastLeg = legs[legs.length - 1];
      const totalMins = Math.max(
        1,
        Math.round(
          (new Date(lastLeg.arrivalDateTimeISO) - new Date(firstLeg.departureDateTimeISO)) / 60000
        )
      );

      journeys.push({
        id: `tt-${originCrs}-${destinationCrs}-${firstLeg.departureDate}-${firstLeg.departureTime.replace(":", "")}-${jIdx}`,
        originStation: getStationByCrs(originCrs).name,
        originCrs: originCrs,
        destinationStation: getStationByCrs(destinationCrs).name,
        destinationCrs: destinationCrs,
        departureDate: firstLeg.departureDate,
        departureTime: topDepTime,
        arrivalDate: lastLeg.arrivalDate,
        arrivalTime: topArrTime,
        totalDurationMinutes: totalMins,
        totalDurationFormatted: formatDuration(totalMins),
        changes: legs.length - 1,
        legs: legs,
        source: "traintimes.org.uk (Live)"
      });
    }

    return journeys;
  }

  // Fetch HTML from traintimes.org.uk via local server.py proxy
  async function fetchTraintimesHtml(traintimesUrl) {
    const proxyEndpoints = [
      `http://localhost:8081/api/traintimes?url=${encodeURIComponent(traintimesUrl)}`,
      `http://127.0.0.1:8081/api/traintimes?url=${encodeURIComponent(traintimesUrl)}`,
      `/api/traintimes?url=${encodeURIComponent(traintimesUrl)}`,
      `http://localhost:8080/api/traintimes?url=${encodeURIComponent(traintimesUrl)}`,
      `http://127.0.0.1:8080/api/traintimes?url=${encodeURIComponent(traintimesUrl)}`
    ];

    let lastError = null;
    for (const endpoint of proxyEndpoints) {
      try {
        const res = await fetch(endpoint);
        if (res.ok) {
          const text = await res.text();
          if (
            text &&
            (text.includes("Accessible UK Train Timetables") ||
              text.includes('<ul class="results">'))
          ) {
            return text;
          }
        }
      } catch (err) {
        lastError = err;
      }
    }

    throw new Error(
      "Local proxy server (server.py on port 8080) is not running or not reachable"
    );
  }

  // Main search entry point
  async function searchTrainJourneys({
    originCrs,
    destinationCrs,
    dateInput,
    timeInput,
    timeMode
  }) {
    const now = new Date();
    const todayStr = formatDateYYYYMMDD(now);
    const currentTimeStr = formatTimeHHMM(now);

    const usedDefaultDate = !(dateInput && dateInput.trim());
    const usedDefaultTime = !(timeInput && timeInput.trim());

    // 3. Optional date: if no date is entered, use today's date
    const effectiveDate = !usedDefaultDate ? dateInput.trim() : todayStr;

    // 4 & 5. Optional departure/arrival time:
    // - If departure mode and blank -> use current time
    // - If arrival mode and blank -> ignore arrival time (use current time in departure mode)
    let effectiveTime = currentTimeStr;
    let effectiveMode = timeMode;

    if (timeMode === "departure") {
      effectiveTime = !usedDefaultTime ? timeInput.trim() : currentTimeStr;
      effectiveMode = "departure";
    } else if (timeMode === "arrival") {
      if (!usedDefaultTime) {
        effectiveTime = timeInput.trim();
        effectiveMode = "arrival";
      } else {
        effectiveTime = currentTimeStr;
        effectiveMode = "departure";
      }
    }

    const traintimesUrl = buildTraintimesUrl({
      originCrs,
      destinationCrs,
      dateStr: effectiveDate,
      timeStr: effectiveTime,
      timeMode: effectiveMode
    });

    const html = await fetchTraintimesHtml(traintimesUrl);
    const journeys = parseTraintimesHtml(html, originCrs, destinationCrs, effectiveDate);

    return {
      journeys: journeys.slice(0, 5),
      effectiveDate,
      effectiveTime,
      effectiveMode,
      ignoredBlankArrivalTime: timeMode === "arrival" && usedDefaultTime,
      traintimesUrl,
      source: `traintimes.org.uk`
    };
  }

  window.RailService = {
    searchTrainJourneys,
    getStationByCrs,
    buildTraintimesUrl,
    parseTraintimesHtml
  };
})();
