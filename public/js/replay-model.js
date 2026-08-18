export const replays = {
  build: {
    label: "Recorded build replay",
    title: "From prompt to working Replit app",
    description:
      "This replay uses confirmed milestones from the prepared build and its finished architecture. It does not show private model reasoning.",
    prompt: "Build a research desk where I can save useful articles with a note and source link.",
    steps: [
      {
        title: "Prompt submitted",
        detail: "The prepared app build started in Replit.",
        reveals: []
      },
      {
        title: "App surface ready",
        detail: "The browser form and findings list were available.",
        reveals: ["browser"]
      },
      {
        title: "Request path confirmed",
        detail: "The finished app exposed POST /api/findings.",
        reveals: ["browser", "api"]
      },
      {
        title: "Storage confirmed",
        detail: "The finished app wrote findings through its database boundary.",
        reveals: ["browser", "api", "database"]
      },
      {
        title: "Trace connected",
        detail: "A sanitized session stream linked runtime events to the map.",
        reveals: ["browser", "api", "database", "stream"]
      }
    ]
  },
  update: {
    label: "Recorded update replay",
    title: "See what the second prompt changed",
    description:
      "The replay compares architecture snapshots captured before and after the prepared Replit update.",
    prompt: "Add topic tags to findings and let me filter the list by tag.",
    steps: [
      {
        title: "Update prompt submitted",
        detail: "The prepared Replit app received one scoped product change.",
        reveals: ["browser", "api", "database", "stream"]
      },
      {
        title: "Tag control added",
        detail: "A topic field and filter appeared in the browser surface.",
        reveals: ["browser", "api", "database", "stream", "filter"],
        added: ["filter"]
      },
      {
        title: "Request shape changed",
        detail: "The existing findings route accepted a sanitized tag value.",
        reveals: ["browser", "api", "database", "stream", "filter"]
      },
      {
        title: "Storage shape changed",
        detail: "The finding record gained a tags field. No new service was added.",
        reveals: ["browser", "api", "database", "stream", "filter", "tags"],
        added: ["filter", "tags"]
      },
      {
        title: "Updated trace verified",
        detail: "A tagged save crossed the same four runtime boundaries.",
        reveals: ["browser", "api", "database", "stream", "filter", "tags"],
        added: ["filter", "tags"]
      }
    ]
  }
};

export function getReplay(type) {
  if (!(type in replays)) throw new Error(`Unknown replay: ${type}`);
  return replays[type];
}
