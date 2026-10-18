/** Test double for @earendil-works/pi-ai/compat (injected via esbuild --alias). */
export const stubState = {
  mode: "ok" as "ok" | "fail" | "hang",
  calls: 0,
  title: "fix login bug",
  requests: [] as { model: any; context: any; options: any }[],
  responses: [] as string[],
};

export async function completeSimple(model: any, context: any, options: any): Promise<{ content: { type: string; text: string }[] }> {
  stubState.calls += 1;
  stubState.requests.push({ model, context, options });
  if (stubState.mode === "fail") throw new Error("stub llm failure");
  if (stubState.mode === "hang") return new Promise(() => {});
  return { content: [{ type: "text", text: stubState.responses.shift() ?? stubState.title }] };
}

export function resetStub(): void {
  stubState.mode = "ok";
  stubState.calls = 0;
  stubState.title = "fix login bug";
  stubState.requests = [];
  stubState.responses = [];
}
