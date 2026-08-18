import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

import { createLivingBlueprintApp } from "./server/app.js";

export { createSessionStore, parseCookies } from "./server/session-store.js";
export { createLivingBlueprintApp } from "./server/app.js";

export async function createLivingBlueprintServer(options = {}) {
  const app = await createLivingBlueprintApp(options);
  return createServer(app);
}

const executedFile = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === executedFile) {
  const port = Number.parseInt(process.env.PORT || "3000", 10);
  const server = await createLivingBlueprintServer();
  server.listen(port, "0.0.0.0", () => {
    console.log(`Living Blueprint is running on http://0.0.0.0:${port}`);
  });
}
