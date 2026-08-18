const panelTabs = document.querySelectorAll("[data-panel-target]");
const panels = document.querySelectorAll("[data-panel]");
const announcement = document.querySelector(".announcement");
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

function announce(message) {
  window.clearTimeout(announcementTimer);
  announcement.textContent = message;
  announcement.classList.add("is-visible");
  announcementTimer = window.setTimeout(() => {
    announcement.classList.remove("is-visible");
  }, 2400);
}

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
