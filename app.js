// Main Application Controller for UK Rail Trip Planner

(function () {
  const stations = (window.UK_STATIONS || []).slice().sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  // Selected state
  let selectedDepartureStation = null;
  let selectedDestinationStation = null;
  let currentJourneys = [];
  let selectedJourneyForCalendar = null;

  // DOM Elements
  const journeyForm = document.getElementById("journeyForm");
  const departureSearchInput = document.getElementById("departureSearchInput");
  const departureDropdownList = document.getElementById("departureDropdownList");
  const departureCrsBadge = document.getElementById("departureCrsBadge");
  const clearDepartureBtn = document.getElementById("clearDepartureBtn");

  const destinationSearchInput = document.getElementById("destinationSearchInput");
  const destinationDropdownList = document.getElementById("destinationDropdownList");
  const destinationCrsBadge = document.getElementById("destinationCrsBadge");
  const clearDestinationBtn = document.getElementById("clearDestinationBtn");

  const swapStationsBtn = document.getElementById("swapStationsBtn");
  const journeyDateInput = document.getElementById("journeyDateInput");
  const clearDateBtn = document.getElementById("clearDateBtn");

  const timeModeDeparture = document.getElementById("timeModeDeparture");
  const timeModeArrival = document.getElementById("timeModeArrival");
  const journeyTimeInput = document.getElementById("journeyTimeInput");
  const clearTimeBtn = document.getElementById("clearTimeBtn");
  const timeHint = document.getElementById("timeHint");

  const searchTrainsBtn = document.getElementById("searchTrainsBtn");
  const searchTrainsBtnLabel = document.getElementById("searchTrainsBtnLabel");
  const formErrorBanner = document.getElementById("formErrorBanner");
  const resultsSection = document.getElementById("resultsSection");
  const resultsTitle = document.getElementById("resultsTitle");
  const resultsSubtitle = document.getElementById("resultsSubtitle");
  const resultsSourceBadge = document.getElementById("resultsSourceBadge");
  const journeysList = document.getElementById("journeysList");

  // Calendar Modal Elements
  const calendarModal = document.getElementById("calendarModal");
  const calendarModalSubtitle = document.getElementById("calendarModalSubtitle");
  const closeCalendarModalBtn = document.getElementById("closeCalendarModalBtn");
  const doneCalendarModalBtn = document.getElementById("doneCalendarModalBtn");
  const downloadIcsBtn = document.getElementById("downloadIcsBtn");
  const calendarOperationFeedback = document.getElementById("calendarOperationFeedback");
  const entriesCountBadge = document.getElementById("entriesCountBadge");
  const calendarEntriesPreviewList = document.getElementById("calendarEntriesPreviewList");

  // Escape HTML helper
  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Highlight matching substring inside station name
  function highlightMatch(text, query) {
    if (!query) return escapeHtml(text);
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const idx = lowerText.indexOf(lowerQuery);
    if (idx === -1) return escapeHtml(text);

    const before = text.slice(0, idx);
    const match = text.slice(idx, idx + query.length);
    const after = text.slice(idx + query.length);
    return `${escapeHtml(before)}<mark>${escapeHtml(match)}</mark>${escapeHtml(after)}`;
  }

  // Filter stations strictly to entries that include the text entered
  function filterStations(queryText) {
    const q = (queryText || "").trim().toLowerCase();
    if (!q) {
      return stations;
    }
    return stations.filter((st) => {
      const nameMatch = st.name.toLowerCase().includes(q);
      const crsMatch = st.crs.toLowerCase().includes(q);
      const displayCombo = `${st.name} (${st.crs})`.toLowerCase().includes(q);
      return nameMatch || crsMatch || displayCombo;
    });
  }

  // Set up searchable station combobox
  function setupStationCombobox({
    inputEl,
    dropdownEl,
    crsBadgeEl,
    clearBtnEl,
    getSelected,
    setSelected
  }) {
    let activeIndex = -1;
    let currentFiltered = [];

    function updateSelectionUI(station) {
      setSelected(station);
      if (station) {
        inputEl.value = station.name;
        crsBadgeEl.textContent = station.crs;
        crsBadgeEl.classList.remove("hidden");
        clearBtnEl.classList.remove("hidden");
      } else {
        crsBadgeEl.textContent = "";
        crsBadgeEl.classList.add("hidden");
        if (inputEl.value) {
          clearBtnEl.classList.remove("hidden");
        } else {
          clearBtnEl.classList.add("hidden");
        }
      }
    }

    function renderDropdown(queryText) {
      const trimmed = (queryText || "").trim();
      currentFiltered = filterStations(trimmed);
      dropdownEl.innerHTML = "";

      if (currentFiltered.length === 0) {
        const emptyLi = document.createElement("li");
        emptyLi.className = "station-dropdown-empty";
        emptyLi.textContent = `No UK stations found matching "${queryText}"`;
        dropdownEl.appendChild(emptyLi);
        activeIndex = -1;
      } else {
        const maxDisplay = trimmed ? 250 : 100;
        const visibleList = currentFiltered.slice(0, maxDisplay);

        visibleList.forEach((st, idx) => {
          const li = document.createElement("li");
          li.className = "station-option" + (idx === activeIndex ? " active" : "");
          li.setAttribute("role", "option");
          li.dataset.crs = st.crs;
          li.innerHTML = `
            <div class="station-option-main">
              <span class="station-option-name">${highlightMatch(st.name, trimmed)}</span>
              <span class="station-option-region">${escapeHtml(st.region)} &bull; ${escapeHtml(st.toc)}</span>
            </div>
            <span class="station-option-crs">${escapeHtml(st.crs)}</span>
          `;

          li.addEventListener("mousedown", (e) => {
            e.preventDefault();
            selectStation(st);
          });

          dropdownEl.appendChild(li);
        });

        if (currentFiltered.length > maxDisplay) {
          const moreLi = document.createElement("li");
          moreLi.className = "station-dropdown-empty";
          moreLi.textContent = `Showing ${maxDisplay} of ${currentFiltered.length} matching UK stations — keep typing to narrow results...`;
          dropdownEl.appendChild(moreLi);
        }
      }

      dropdownEl.classList.remove("hidden");
      inputEl.setAttribute("aria-expanded", "true");
    }

    function closeDropdown() {
      dropdownEl.classList.add("hidden");
      inputEl.setAttribute("aria-expanded", "false");
      activeIndex = -1;
    }

    function selectStation(station) {
      updateSelectionUI(station);
      closeDropdown();
      hideFormError();
    }

    inputEl.addEventListener("focus", () => {
      const currentVal = inputEl.value;
      const selected = getSelected();
      const filterQuery = selected && selected.name === currentVal ? "" : currentVal;
      activeIndex = 0;
      renderDropdown(filterQuery);
    });

    inputEl.addEventListener("input", () => {
      const val = inputEl.value;
      const selected = getSelected();
      if (selected && selected.name !== val) {
        setSelected(null);
        crsBadgeEl.classList.add("hidden");
      }
      if (val) {
        clearBtnEl.classList.remove("hidden");
      } else {
        clearBtnEl.classList.add("hidden");
      }
      activeIndex = 0;
      renderDropdown(val);
    });

    inputEl.addEventListener("keydown", (e) => {
      const isOpen = !dropdownEl.classList.contains("hidden");

      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (!isOpen) {
          activeIndex = 0;
          renderDropdown(inputEl.value);
          return;
        }
        if (currentFiltered.length > 0) {
          activeIndex = (activeIndex + 1) % currentFiltered.length;
          updateActiveOptionHighlight();
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (!isOpen) {
          activeIndex = 0;
          renderDropdown(inputEl.value);
          return;
        }
        if (currentFiltered.length > 0) {
          activeIndex = (activeIndex - 1 + currentFiltered.length) % currentFiltered.length;
          updateActiveOptionHighlight();
        }
      } else if (e.key === "Escape") {
        if (isOpen) {
          e.preventDefault();
          closeDropdown();
        }
      } else if (e.key === "Enter") {
        if (!getSelected() && currentFiltered.length > 0) {
          const pickIdx = activeIndex >= 0 ? activeIndex : 0;
          selectStation(currentFiltered[pickIdx]);
        } else if (isOpen && activeIndex >= 0 && currentFiltered[activeIndex]) {
          selectStation(currentFiltered[activeIndex]);
        }
      }
    });

    inputEl.addEventListener("blur", () => {
      setTimeout(() => {
        if (!getSelected() && inputEl.value.trim()) {
          const matches = filterStations(inputEl.value.trim());
          if (matches.length > 0) {
            updateSelectionUI(matches[0]);
          }
        }
        closeDropdown();
      }, 150);
    });

    clearBtnEl.addEventListener("click", () => {
      inputEl.value = "";
      updateSelectionUI(null);
      inputEl.focus();
      activeIndex = 0;
      renderDropdown("");
    });

    function updateActiveOptionHighlight() {
      const items = dropdownEl.querySelectorAll(".station-option");
      items.forEach((item, idx) => {
        if (idx === activeIndex) {
          item.classList.add("active");
          item.scrollIntoView({ block: "nearest" });
        } else {
          item.classList.remove("active");
        }
      });
    }

    return {
      setStation: updateSelectionUI
    };
  }

  const departureCombo = setupStationCombobox({
    inputEl: departureSearchInput,
    dropdownEl: departureDropdownList,
    crsBadgeEl: departureCrsBadge,
    clearBtnEl: clearDepartureBtn,
    getSelected: () => selectedDepartureStation,
    setSelected: (st) => {
      selectedDepartureStation = st;
    }
  });

  const destinationCombo = setupStationCombobox({
    inputEl: destinationSearchInput,
    dropdownEl: destinationDropdownList,
    crsBadgeEl: destinationCrsBadge,
    clearBtnEl: clearDestinationBtn,
    getSelected: () => selectedDestinationStation,
    setSelected: (st) => {
      selectedDestinationStation = st;
    }
  });

  // Swap button
  swapStationsBtn.addEventListener("click", () => {
    const temp = selectedDepartureStation;
    departureCombo.setStation(selectedDestinationStation);
    destinationCombo.setStation(temp);
  });

  // Quick example route chips
  document.querySelectorAll(".chip-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const fromCrs = btn.dataset.from;
      const toCrs = btn.dataset.to;
      const fromSt = window.RailService.getStationByCrs(fromCrs);
      const toSt = window.RailService.getStationByCrs(toCrs);
      departureCombo.setStation(fromSt);
      destinationCombo.setStation(toSt);
      executeTrainSearch();
    });
  });

  // Optional Date Clear button
  clearDateBtn.addEventListener("click", () => {
    journeyDateInput.value = "";
  });

  // Optional Time Clear button
  clearTimeBtn.addEventListener("click", () => {
    journeyTimeInput.value = "";
  });

  // Radio Option Button for Departure vs Arrival Time
  function updateTimeModeHint() {
    if (timeModeDeparture.checked) {
      timeHint.textContent =
        "Departure time selected: if no departure time is entered, the current time will be used.";
      journeyTimeInput.placeholder = "Current time";
    } else {
      timeHint.textContent =
        "Arrival time selected: if no arrival time is entered, arrival time is ignored.";
      journeyTimeInput.placeholder = "Optional arrival time";
    }
  }

  timeModeDeparture.addEventListener("change", updateTimeModeHint);
  timeModeArrival.addEventListener("change", updateTimeModeHint);

  // Allow pressing Enter on any input (including date, time, radio buttons) to submit the search form
  journeyForm.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (!selectedDepartureStation && departureSearchInput.value.trim()) {
        const m = filterStations(departureSearchInput.value.trim());
        if (m.length > 0) departureCombo.setStation(m[0]);
      }
      if (!selectedDestinationStation && destinationSearchInput.value.trim()) {
        const m = filterStations(destinationSearchInput.value.trim());
        if (m.length > 0) destinationCombo.setStation(m[0]);
      }
      departureDropdownList.classList.add("hidden");
      destinationDropdownList.classList.add("hidden");
      executeTrainSearch();
    }
  });

  journeyForm.addEventListener("submit", (e) => {
    e.preventDefault();
    executeTrainSearch();
  });

  function showFormError(msg) {
    formErrorBanner.textContent = msg;
    formErrorBanner.classList.remove("hidden");
  }

  function hideFormError() {
    formErrorBanner.textContent = "";
    formErrorBanner.classList.add("hidden");
  }

  // Execute search & render next 5 journeys from traintimes.org.uk
  async function executeTrainSearch() {
    hideFormError();

    if (!selectedDepartureStation && departureSearchInput.value.trim()) {
      const m = filterStations(departureSearchInput.value.trim());
      if (m.length > 0) departureCombo.setStation(m[0]);
    }
    if (!selectedDestinationStation && destinationSearchInput.value.trim()) {
      const m = filterStations(destinationSearchInput.value.trim());
      if (m.length > 0) destinationCombo.setStation(m[0]);
    }

    if (!selectedDepartureStation) {
      showFormError("Please select a UK departure station from the dropdown list.");
      departureSearchInput.focus();
      return;
    }

    if (!selectedDestinationStation) {
      showFormError("Please select a UK destination station from the dropdown list.");
      destinationSearchInput.focus();
      return;
    }

    if (selectedDepartureStation.crs === selectedDestinationStation.crs) {
      showFormError("Departure and destination stations must be different.");
      destinationSearchInput.focus();
      return;
    }

    const timeMode = timeModeArrival.checked ? "arrival" : "departure";
    const dateInput = journeyDateInput.value;
    const timeInput = journeyTimeInput.value;

    try {
      searchTrainsBtn.disabled = true;
      if (searchTrainsBtnLabel) {
        searchTrainsBtnLabel.textContent = "Fetching from traintimes.org.uk...";
      }

      const searchResult = await window.RailService.searchTrainJourneys({
        originCrs: selectedDepartureStation.crs,
        destinationCrs: selectedDestinationStation.crs,
        dateInput,
        timeInput,
        timeMode
      });

      currentJourneys = searchResult.journeys || [];
      if (currentJourneys.length === 0) {
        showFormError(
          `No train journeys found on traintimes.org.uk for ${selectedDepartureStation.name} → ${selectedDestinationStation.name} at that date/time.`
        );
        return;
      }

      renderJourneysList(searchResult);
    } catch (err) {
      showFormError(
        `Could not fetch journey data from traintimes.org.uk (${err.message}). Please check your internet connection and try again.`
      );
    } finally {
      searchTrainsBtn.disabled = false;
      if (searchTrainsBtnLabel) {
        searchTrainsBtnLabel.textContent = "Search Next 5 Journeys";
      }
    }
  }

  function formatDisplayDate(yyyyMmDd) {
    const [y, m, d] = yyyyMmDd.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric"
    });
  }

  function renderJourneysList(searchResult) {
    resultsSection.classList.remove("hidden");
    const {
      journeys,
      effectiveDate,
      effectiveTime,
      effectiveMode,
      ignoredBlankArrivalTime,
      traintimesUrl
    } = searchResult;

    resultsTitle.textContent = `Next 5 Journeys: ${selectedDepartureStation.name} (${selectedDepartureStation.crs}) → ${selectedDestinationStation.name} (${selectedDestinationStation.crs})`;

    let timeDesc =
      effectiveMode === "arrival"
        ? `Arriving by ${effectiveTime} (${effectiveTime}a)`
        : `Departing from ${effectiveTime}`;
    if (ignoredBlankArrivalTime) {
      timeDesc = `Departing from ${effectiveTime} (no arrival time entered — arrival constraint ignored)`;
    } else if (!journeyTimeInput.value && effectiveMode === "departure") {
      timeDesc = `Departing from ${effectiveTime} (current time)`;
    }
    const dateDesc = journeyDateInput.value
      ? formatDisplayDate(effectiveDate)
      : `${formatDisplayDate(effectiveDate)} (Today)`;

    resultsSubtitle.textContent = `${dateDesc} • ${timeDesc}`;

    if (traintimesUrl) {
      resultsSourceBadge.textContent = `Source: ${decodeURIComponent(traintimesUrl)} ↗`;
      resultsSourceBadge.href = traintimesUrl;
    } else {
      resultsSourceBadge.textContent = "Source: traintimes.org.uk";
      resultsSourceBadge.href = "https://traintimes.org.uk/";
    }

    journeysList.innerHTML = "";

    journeys.forEach((journey, idx) => {
      const card = document.createElement("article");
      card.className = "journey-card";
      card.tabIndex = 0;
      card.setAttribute(
        "aria-label",
        `Journey ${idx + 1}: Departs ${journey.departureTime}, Arrives ${journey.arrivalTime}. Click to add to Google Calendar.`
      );

      const changesLabel =
        journey.changes === 0
          ? "Direct (1 leg)"
          : `${journey.changes} change${journey.changes > 1 ? "s" : ""} (${journey.legs.length} legs)`;
      const changesClass = journey.changes === 0 ? "changes-direct" : "changes-connect";

      const legsHtml = journey.legs
        .map((leg) => {
          return `
            <div class="leg-row">
              <div class="leg-endpoint">
                <span class="leg-time">${escapeHtml(leg.departureTime)}</span>
                <span class="leg-station">${escapeHtml(leg.fromStation)}</span>
                <span class="platform-badge" title="Departure Platform">p${escapeHtml(leg.departurePlatform)}</span>
              </div>

              <div class="leg-service-center">
                <span class="leg-operator-note">${escapeHtml(leg.serviceDetails)}</span>
                <span class="leg-calendar-preview-hint">
                  Leg ${leg.legNumber} &bull; ${escapeHtml(leg.durationFormatted)} &bull; Separate Depart/Arrive or Combined Calendar Entry
                </span>
              </div>

              <div class="leg-endpoint arrival-end">
                <span class="leg-time">${escapeHtml(leg.arrivalTime)}</span>
                <span class="leg-station">${escapeHtml(leg.toStation)}</span>
                <span class="platform-badge" title="Arrival Platform">p${escapeHtml(leg.arrivalPlatform)}</span>
              </div>
            </div>
          `;
        })
        .join("");

      card.innerHTML = `
        <div class="journey-summary-bar">
          <div class="journey-times-main">
            <span class="journey-index-pill">Option ${idx + 1}</span>
            <span class="time-large">${escapeHtml(journey.departureTime)}</span>
            <span class="time-arrow">→</span>
            <span class="time-large">${escapeHtml(journey.arrivalTime)}</span>
            <div class="journey-badges">
              <span class="duration-pill">${escapeHtml(journey.totalDurationFormatted)}</span>
              <span class="changes-pill ${changesClass}">${escapeHtml(changesLabel)}</span>
            </div>
          </div>

          <button type="button" class="btn btn-primary btn-sm select-journey-btn">
            📅 Select &amp; Add to Google Calendar
          </button>
        </div>

        <div class="journey-legs">
          ${legsHtml}
        </div>
      `;

      const handleSelect = () => {
        onJourneySelected(journey);
      };

      card.addEventListener("click", handleSelect);
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleSelect();
        }
      });

      journeysList.appendChild(card);
    });

    resultsSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // Handle selecting one of the 5 journeys to add to Google Calendar
  function onJourneySelected(journey) {
    selectedJourneyForCalendar = journey;
    const entries = window.CalendarService.buildCalendarEntriesForJourney(journey);

    calendarModalSubtitle.textContent = `${journey.originStation} (${journey.departureTime}) → ${journey.destinationStation} (${journey.arrivalTime}) on ${formatDisplayDate(journey.departureDate)} • ${journey.legs.length} leg${journey.legs.length > 1 ? "s" : ""}`;
    entriesCountBadge.textContent = String(entries.length);

    calendarOperationFeedback.classList.add("hidden");
    calendarOperationFeedback.textContent = "";

    renderCalendarEntriesPreview(entries);
    calendarModal.classList.remove("hidden");
  }

  function renderCalendarEntriesPreview(entries) {
    calendarEntriesPreviewList.innerHTML = "";

    entries.forEach((entry) => {
      const card = document.createElement("div");
      const isDep = entry.entryType === "Departure";
      const isArr = entry.entryType === "Arrival";
      const cardTypeClass = isDep
        ? "entry-departure"
        : isArr
        ? "entry-arrival"
        : "entry-combined";
      card.className = `cal-entry-card ${cardTypeClass}`;

      const webTemplateUrl = window.CalendarService.buildGoogleCalendarTemplateUrl(entry);

      const platformsRowHtml =
        !isDep && !isArr && entry.platformsText
          ? `
            <div class="cal-spec-row">
              <span class="cal-spec-key">Platforms:</span>
              <span class="cal-spec-val">${escapeHtml(entry.platformsText)}</span>
            </div>
          `
          : "";

      const noteRowHtml = entry.note
        ? `
          <div class="cal-spec-row">
            <span class="cal-spec-key">Note:</span>
            <span class="cal-spec-val" style="white-space: pre-line;">${escapeHtml(entry.note)}</span>
          </div>
        `
        : "";

      card.innerHTML = `
        <div>
          <div class="cal-entry-header">
            <span class="cal-entry-badge">Leg ${entry.legNumber} &bull; ${escapeHtml(entry.entryType)}</span>
            <span class="cal-entry-time">${escapeHtml(entry.dateStr)} at ${escapeHtml(entry.timeStr)}</span>
          </div>

          <div class="cal-spec-list" style="margin-top: 10px;">
            <div class="cal-spec-row">
              <span class="cal-spec-key">Title:</span>
              <span class="cal-spec-val title-val">${escapeHtml(entry.title)}</span>
            </div>
            <div class="cal-spec-row">
              <span class="cal-spec-key">Location:</span>
              <span class="cal-spec-val">${escapeHtml(entry.location)}</span>
            </div>
            ${platformsRowHtml}
            ${noteRowHtml}
            <div class="cal-spec-row">
              <span class="cal-spec-key">Notification:</span>
              <span class="cal-spec-val">${entry.notificationMinutes} minutes</span>
            </div>
          </div>
        </div>

        <div class="cal-entry-footer">
          <span style="font-size: 0.75rem; color: var(--text-muted);">Ready to add</span>
          <a href="${escapeHtml(webTemplateUrl)}" target="_blank" rel="noopener noreferrer" class="cal-entry-link">Add in Browser Google Calendar ↗</a>
        </div>
      `;

      calendarEntriesPreviewList.appendChild(card);
    });
  }

  function showCalendarFeedback(message, type) {
    calendarOperationFeedback.textContent = message;
    calendarOperationFeedback.className = `operation-feedback ${type}`;
    calendarOperationFeedback.classList.remove("hidden");
  }

  downloadIcsBtn.addEventListener("click", () => {
    if (!selectedJourneyForCalendar) return;
    window.CalendarService.downloadJourneyIcs(selectedJourneyForCalendar);
    showCalendarFeedback(
      "Downloaded .ics file containing all leg Departure (10m notification) and Arrival (5m notification) entries for Google Calendar.",
      "success"
    );
  });

  function closeCalendarModal() {
    calendarModal.classList.add("hidden");
  }

  closeCalendarModalBtn.addEventListener("click", closeCalendarModal);
  doneCalendarModalBtn.addEventListener("click", closeCalendarModal);
  calendarModal.addEventListener("click", (e) => {
    if (e.target === calendarModal) closeCalendarModal();
  });

  updateTimeModeHint();
})();
