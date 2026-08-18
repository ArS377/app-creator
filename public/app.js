import { createFaultedTrace, createSuccessfulTrace, formatMilliseconds } from "./js/trace-model.js";

const panelTabs = document.querySelectorAll("[data-panel-target]");
const panels = document.querySelectorAll("[data-panel]");
const announcement = document.querySelector(".announcement");
const findingForm = document.querySelector(".finding-form");
const saveButton = findingForm.querySelector('button[type="submit"]');
const findingList = document.querySelector(".finding-list");
const findingCount = document.querySelector("[data-finding-count]");
const timelineInput = document.querySelector(".timeline-input");
const timelineProgress = document.querySelector(".timeline-progress");
const timelineHandle = document.querySelector(".timeline-handle");
const timelineEvents = document.querySelector(".timeline-events");
const timelineTitle = document.querySelector("#timeline-title");
const timelineOutput = document.querySelector(".timeline-heading output");
const faultSwitch = document.querySelector("[data-fault-switch]");
const faultDock = document.querySelector(".fault-dock");
const diagnosisEmpty = document.querySelector("[data-diagnosis-empty]");
const diagnosisLoading = document.querySelector("[data-diagnosis-loading]");
const diagnosisResult = document.querySelector("[data-diagnosis-result]");
const investigatorMode = document.querySelector("[data-investigator-mode]");
const tutorial = document.querySelector(".tutorial");
const tutorialContent = [
  {
    kicker: "Step 1 · See what was built",
    title: "Start with the build replay",
    description:
      "Watch the prepared Replit app take shape. The replay shows confirmed milestones and the finished architecture, not hidden model reasoning.",
    callout: "The browser, API route, database, and trace stream appearing on the map.",
    caption: "Recorded Replit build"
  },
  {
    kicker: "Step 2 · Create a live trace",
    title: "Save one finding",
    description:
      "Use the sample app like a normal product. Living Blueprint records the action as it crosses the browser, API, and database.",
    callout: "The path lighting up while the timeline records each event.",
    caption: "Live sample app"
  },
  {
    kicker: "Step 3 · Break one boundary",
    title: "Turn on a safe test fault",
    description:
      "Fault Lab can reject the next database write for this demo session. It never touches another visitor or a production app.",
    callout: "The failure begins at the database boundary, not in the browser.",
    caption: "Session-only test fault"
  },
  {
    kicker: "Step 4 · Check the explanation",
    title: "Inspect the cited evidence",
    description:
      "The investigator identifies the first abnormal event, explains the effect, and links every claim back to a trace event you can inspect.",
    callout: "Evidence links that jump to the exact point on the timeline.",
    caption: "Evidence-linked diagnosis"
  },
  {
    kicker: "Step 5 · Compare an update",
    title: "Finish with the update replay",
    description:
      "See how a second prompt changed the prepared app. The map compares architecture snapshots before and after the Replit update.",
    callout: "Added, changed, and unchanged system boundaries on the map.",
    caption: "Recorded Replit update"
  }
];
let tutorialStep = 0;
let announcementTimer;
let tracePlaybackTimer;
let activeTrace = null;
let activeEventIndex = -1;
let savedFindingCount = 3;
let faultArmed = false;

function announce(message) {
  window.clearTimeout(announcementTimer);
  announcement.textContent = message;
  announcement.classList.add("is-visible");
  announcementTimer = window.setTimeout(() => {
    announcement.classList.remove("is-visible");
  }, 2400);
}

function setJourneyStep(index) {
  document.querySelectorAll("[data-journey-step]").forEach((step, stepIndex) => {
    step.classList.toggle("is-current", stepIndex === index);
  });
}

function renderTimelineEvents(trace) {
  timelineEvents.replaceChildren(
    ...trace.events.map((event, index) => {
      const button = document.createElement("button");
      const title = document.createElement("strong");
      const time = document.createElement("span");

      button.className = "timeline-event";
      button.classList.toggle("is-error", event.level === "error");
      button.type = "button";
      button.dataset.eventIndex = String(index);
      button.setAttribute("aria-label", `${event.title}, ${formatMilliseconds(event.at)}`);
      title.textContent = event.title;
      time.textContent = formatMilliseconds(event.at);
      button.append(title, time);
      button.addEventListener("click", () => {
        window.clearTimeout(tracePlaybackTimer);
        renderTraceEvent(index);
      });
      return button;
    })
  );
}

function renderTraceEvent(index) {
  if (!activeTrace) return;

  activeEventIndex = Math.max(0, Math.min(index, activeTrace.events.length - 1));
  const event = activeTrace.events[activeEventIndex];
  const progress = activeTrace.duration ? (event.at / activeTrace.duration) * 100 : 0;

  document.querySelector("[data-event-sequence]").textContent =
    `${String(activeEventIndex + 1).padStart(2, "0")} / ${String(activeTrace.events.length).padStart(2, "0")}`;
  document.querySelector("[data-event-title]").textContent = event.title;
  document.querySelector("[data-event-detail]").textContent = event.detail;
  document.querySelector("[data-event-time]").textContent = formatMilliseconds(event.at);
  timelineTitle.textContent = event.title;
  timelineOutput.value = formatMilliseconds(event.at);
  timelineInput.value = String(activeEventIndex);
  timelineProgress.style.width = `${progress}%`;
  timelineHandle.style.left = `calc(${progress}% - 6px)`;

  document.querySelectorAll("[data-node]").forEach((node) => {
    const observed = activeTrace.events
      .slice(0, activeEventIndex + 1)
      .some((candidate) => candidate.node === node.dataset.node);
    node.classList.toggle("is-observed", observed);
    node.classList.toggle("is-active", node.dataset.node === event.node);
    node.classList.toggle(
      "is-error",
      node.dataset.node === event.node && event.level === "error"
    );
  });

  document.querySelectorAll("[data-edge]").forEach((edge) => {
    const observed = activeTrace.events
      .slice(0, activeEventIndex + 1)
      .some((candidate) => candidate.edge === edge.dataset.edge);
    edge.classList.toggle("is-observed", observed);
    edge.classList.toggle("is-active", edge.dataset.edge === event.edge);
    edge.classList.toggle("is-error", edge.dataset.edge === event.edge && event.level === "error");
  });

  timelineEvents.querySelectorAll(".timeline-event").forEach((button, buttonIndex) => {
    button.classList.toggle("is-observed", buttonIndex <= activeEventIndex);
    button.classList.toggle("is-active", buttonIndex === activeEventIndex);
    if (buttonIndex === activeEventIndex) {
      button.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    }
  });
}

function renderDiagnosis(diagnosis) {
  diagnosisLoading.hidden = true;
  diagnosisResult.hidden = false;
  investigatorMode.textContent = diagnosis.mode === "ai" ? "AI reviewed" : "Local evidence";
  document.querySelector("[data-diagnosis-summary]").textContent = diagnosis.summary;
  document.querySelector("[data-diagnosis-cause]").textContent = diagnosis.cause;
  document.querySelector("[data-diagnosis-effect]").textContent = diagnosis.effect;
  document.querySelector("[data-diagnosis-next]").textContent = diagnosis.nextStep;

  const evidenceContainer = document.querySelector("[data-diagnosis-evidence]");
  evidenceContainer.replaceChildren(
    ...diagnosis.evidence.map((evidence) => {
      const eventIndex = activeTrace.events.findIndex((event) => event.id === evidence.eventId);
      const button = document.createElement("button");
      const eventId = document.createElement("span");
      const claim = document.createElement("p");

      button.type = "button";
      button.className = "evidence-link";
      eventId.textContent = evidence.eventId;
      claim.textContent = evidence.claim;
      button.append(eventId, claim);
      button.addEventListener("click", () => {
        if (eventIndex >= 0) renderTraceEvent(eventIndex);
      });
      return button;
    })
  );

  const firstErrorIndex = activeTrace.events.findIndex(
    (event) => event.id === diagnosis.firstAbnormalEventId
  );
  if (firstErrorIndex >= 0) renderTraceEvent(firstErrorIndex);
  setJourneyStep(3);
}

async function investigateActiveTrace() {
  diagnosisEmpty.hidden = true;
  diagnosisResult.hidden = true;
  diagnosisLoading.hidden = false;
  investigatorMode.textContent = "Reviewing";

  try {
    const response = await fetch("/api/investigate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ trace: activeTrace })
    });
    if (!response.ok) throw new Error("The investigator could not read this trace.");
    renderDiagnosis(await response.json());
  } catch {
    diagnosisLoading.hidden = true;
    diagnosisEmpty.hidden = false;
    investigatorMode.textContent = "Unavailable";
    diagnosisEmpty.querySelector("h3").textContent = "Investigator unavailable";
    diagnosisEmpty.querySelector("p").textContent =
      "The trace is still available. Restart the app server to restore the evidence review.";
  }
}

function finishSuccessfulSave() {
  const findingText = findingForm.querySelector('input[type="text"]').value.trim();
  const article = document.createElement("article");
  const number = document.createElement("span");
  const copy = document.createElement("p");

  savedFindingCount += 1;
  number.className = "finding-number";
  number.textContent = String(savedFindingCount).padStart(2, "0");
  copy.textContent = findingText;
  article.append(number, copy);
  findingList.prepend(article);
  findingCount.textContent = `${savedFindingCount} findings`;
  saveButton.disabled = false;
  saveButton.classList.remove("is-saving");
  saveButton.textContent = "Save finding";
  announce("Finding saved. Scrub the trace to inspect each boundary.");
}

function finishFaultedSave() {
  saveButton.disabled = false;
  saveButton.classList.remove("is-saving");
  saveButton.textContent = "Retry save";
  announce("The test fault rejected the save. The investigator is checking why.");
  investigateActiveTrace();
}

function playTrace(trace) {
  window.clearTimeout(tracePlaybackTimer);
  activeTrace = trace;
  activeEventIndex = -1;
  timelineInput.disabled = false;
  timelineInput.max = String(trace.events.length - 1);
  renderTimelineEvents(trace);

  function advance() {
    const nextIndex = activeEventIndex + 1;
    renderTraceEvent(nextIndex);

    if (nextIndex < trace.events.length - 1) {
      const currentTime = trace.events[nextIndex].at;
      const nextTime = trace.events[nextIndex + 1].at;
      tracePlaybackTimer = window.setTimeout(advance, Math.max(180, (nextTime - currentTime) * 5));
    } else {
      if (trace.status === "error") finishFaultedSave();
      else finishSuccessfulSave();
    }
  }

  advance();
}

findingForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!findingForm.reportValidity() || saveButton.disabled) return;

  setJourneyStep(faultArmed ? 2 : 1);
  saveButton.disabled = true;
  saveButton.classList.add("is-saving");
  saveButton.textContent = "Saving";
  playTrace(faultArmed ? createFaultedTrace() : createSuccessfulTrace());
});

faultSwitch.addEventListener("click", () => {
  faultArmed = !faultArmed;
  faultSwitch.setAttribute("aria-checked", String(faultArmed));
  faultDock.classList.toggle("is-armed", faultArmed);
  setJourneyStep(faultArmed ? 2 : 1);
  announce(
    faultArmed
      ? "Fault armed for this session. The next database write will be rejected."
      : "Fault cleared. The next database write can complete normally."
  );
});

timelineInput.addEventListener("input", () => {
  window.clearTimeout(tracePlaybackTimer);
  renderTraceEvent(Number.parseInt(timelineInput.value, 10));
});

document.querySelectorAll("[data-node]").forEach((node) => {
  node.addEventListener("click", () => {
    if (!activeTrace) {
      announce("Save a finding first, then use the map to inspect its trace.");
      return;
    }

    const matchingIndex = activeTrace.events.findIndex((event) => event.node === node.dataset.node);
    if (matchingIndex >= 0) renderTraceEvent(matchingIndex);
  });
});

panelTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const nextPanel = tab.dataset.panelTarget;

    panelTabs.forEach((candidate) => {
      candidate.classList.toggle("is-active", candidate === tab);
    });

    panels.forEach((panel) => {
      panel.classList.toggle("is-active", panel.dataset.panel === nextPanel);
    });
  });
});

function renderTutorialStep() {
  const content = tutorialContent[tutorialStep];
  tutorial.querySelector("[data-tutorial-count]").textContent = String(tutorialStep + 1);
  tutorial.querySelector("[data-tutorial-kicker]").textContent = content.kicker;
  tutorial.querySelector("[data-tutorial-title]").textContent = content.title;
  tutorial.querySelector("[data-tutorial-description]").textContent = content.description;
  tutorial.querySelector("[data-tutorial-callout]").textContent = content.callout;
  tutorial.querySelector("[data-tutorial-caption]").textContent = content.caption;

  tutorial.querySelectorAll("[data-tutorial-marker]").forEach((marker, index) => {
    marker.classList.toggle("is-current", index === tutorialStep);
    marker.classList.toggle("is-complete", index < tutorialStep);
  });

  tutorial.querySelectorAll("[data-tutorial-visual]").forEach((node, index) => {
    node.classList.toggle("is-current", index === tutorialStep);
    node.classList.toggle("is-complete", index < tutorialStep);
  });

  tutorial.querySelector("[data-tutorial-back]").disabled = tutorialStep === 0;
  tutorial.querySelector("[data-tutorial-next]").textContent =
    tutorialStep === tutorialContent.length - 1 ? "Explore sample" : "Next";
}

function openTutorial() {
  tutorialStep = 0;
  renderTutorialStep();
  tutorial.showModal();
}

function closeTutorial() {
  tutorial.close();
  sessionStorage.setItem("living-blueprint-tour", "seen");
}

document.querySelector('[data-action="tutorial"]').addEventListener("click", openTutorial);

tutorial.querySelectorAll("[data-tutorial-close]").forEach((button) => {
  button.addEventListener("click", closeTutorial);
});

tutorial.querySelector("[data-tutorial-back]").addEventListener("click", () => {
  tutorialStep = Math.max(0, tutorialStep - 1);
  renderTutorialStep();
});

tutorial.querySelector("[data-tutorial-next]").addEventListener("click", () => {
  if (tutorialStep === tutorialContent.length - 1) {
    closeTutorial();
    document.querySelector(".finding-form input").focus();
    announce("Start by saving the prepared finding.");
    return;
  }

  tutorialStep += 1;
  renderTutorialStep();
});

tutorial.addEventListener("cancel", () => {
  sessionStorage.setItem("living-blueprint-tour", "seen");
});

document.querySelectorAll('[data-action="replay-build"], [data-action="replay-update"]').forEach((button) => {
  button.addEventListener("click", () => {
    announce("Replay controls arrive in the final demo slice.");
  });
});

if (sessionStorage.getItem("living-blueprint-tour") !== "seen") {
  window.setTimeout(openTutorial, 450);
}
