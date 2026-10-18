import { mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq, summary } from "./support/assert";

// Redirect the actual config path before importing index.ts (also safe on Windows).
const agentDir = mkdtempSync(join(tmpdir(), "ar-thinking-"));
process.env.PI_CODING_AGENT_DIR = agentDir;
process.env.AGENT_BOARD_ROOT = join(agentDir, "board");
const configPath = join(agentDir, "auto-rename.json");
const { makeHarness, writeSessionFile } = await import("./support/fake-pi");
const { resetStub, stubState } = await import("./support/pi-ai-stub");
const autoRename = (await import("../index")).default;

let mtime = Date.now();
function writeConfig(config: unknown): void {
  writeFileSync(configPath, JSON.stringify(config));
  // Explicitly advance the mtime to exercise the cache reliably on every FS.
  const time = new Date(mtime += 2000);
  utimesSync(configPath, time, time);
}

function harness() {
  const branch = [{ type: "message", message: { role: "user", content: [{ type: "text", text: "Fix the login bug in the API" }] } }];
  const sessionFile = writeSessionFile(join(agentDir, "session"), Date.now() / 1000 - 60, ["Fix the login bug in the API"]);
  const h = makeHarness({ sessionFile, branch });
  const commands = new Map<string, any>();
  const notices: string[] = [];
  h.pi.registerCommand = (name: string, command: any) => commands.set(name, command);
  h.ctx.ui.notify = (text: string) => notices.push(text);
  autoRename(h.pi);
  const command = (name = "autorename") => commands.get(name).handler("", h.ctx);
  return { ...h, command, notices };
}

try {
  resetStub();
  const h = harness();
  eq("missing config is created in the configured agent directory", JSON.parse(readFileSync(configPath, "utf8")).thinkingLevel, "low");
  await h.command();
  eq("new config uses low reasoning", stubState.requests[0]?.options.reasoning, "low");
  eq("rename succeeds with default config", h.names.at(-1), "fix login bug");

  for (const level of ["off", "minimal", "low", "medium", "high", "xhigh", "max"]) {
    resetStub();
    writeConfig({ thinkingLevel: level, model: "stub/stub", lang: "en" });
    await h.command();
    eq(`${level} reaches the provider-neutral API`, stubState.requests[0]?.options.reasoning, level === "off" ? undefined : level);
    eq(`${level} makes exactly one model request`, stubState.calls, 1);
    eq(`${level} preserves maxTokens`, stubState.requests[0]?.options.maxTokens, 1024);
    eq(`${level} preserves authentication`, stubState.requests[0]?.options.apiKey, "stub");
    eq(`${level} does not pass provider-specific reasoningEffort`, "reasoningEffort" in stubState.requests[0].options, false);
    eq(`${level} leaves the main model unchanged`, h.ctx.model.id, "stub");
    await h.command("autorename-status");
    eq(`${level} is shown in status`, h.notices.at(-1)?.includes(`thinking=${level}`), true);
  }

  for (const value of [undefined, null, false, 0, {}, [], "", "HIGH", "invalid"]) {
    resetStub();
    writeConfig({ thinkingLevel: value });
    await h.command();
    eq(`missing/invalid value ${JSON.stringify(value)} falls back to low`, stubState.requests[0]?.options.reasoning, "low");
  }

  resetStub();
  writeConfig({ thinkingLevel: "high" });
  stubState.responses = ["", "fix login bug"];
  await h.command();
  eq("transient empty output triggers retry", stubState.calls, 2);
  eq("retry preserves configured reasoning", stubState.requests[1]?.options.reasoning, "high");

  resetStub();
  writeConfig({ thinkingLevel: "max" });
  stubState.responses = ["I will fix the login bug for you.", "fix login bug"];
  await h.command();
  eq("response-like title triggers corrective retry", stubState.calls, 2);
  eq("corrective retry preserves configured reasoning", stubState.requests[1]?.options.reasoning, "max");

  // Background attempts use the same config, independent of /autorename.
  resetStub();
  writeConfig({ thinkingLevel: "medium" });
  const background = harness();
  await background.fire("session_shutdown", { reason: "quit" });
  eq("background rename uses configured reasoning", stubState.requests[0]?.options.reasoning, "medium");

  resetStub();
  writeConfig({ enabled: false, thinkingLevel: "high" });
  await h.command();
  eq("disabled config still makes no model requests", stubState.calls, 0);
} finally {
  rmSync(agentDir, { recursive: true, force: true });
}
summary();
