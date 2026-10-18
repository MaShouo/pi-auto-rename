/** Minimal path API double for extension tests (injected via esbuild --alias). */
import { homedir } from "node:os";
import { join } from "node:path";

export function getAgentDir(): string {
  const configured = process.env.PI_CODING_AGENT_DIR;
  if (configured?.startsWith("~/") || configured?.startsWith("~\\")) {
    return join(homedir(), configured.slice(2));
  }
  return configured ?? join(homedir(), ".pi", "agent");
}
