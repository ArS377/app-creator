const panelTabs = document.querySelectorAll("[data-panel-target]");
const panels = document.querySelectorAll("[data-panel]");
const announcement = document.querySelector(".announcement");
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

document.querySelectorAll("[data-action]").forEach((button) => {
  button.addEventListener("click", () => {
    announce("This control becomes active in the next feature slice.");
  });
});
