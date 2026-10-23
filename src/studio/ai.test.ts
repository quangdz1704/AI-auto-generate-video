import { afterEach, beforeEach, expect, it } from "vitest";
import nock from "nock";
import { apiText } from "./ai.js";
import { SettingsSchema } from "./schema.js";

beforeEach(() => nock.disableNetConnect());
afterEach(() => {
  nock.cleanAll();
  nock.enableNetConnect();
});

it("uses the user's compatible endpoint, model and key through the installed AI SDK", async () => {
  const scope = nock("http://127.0.0.1:11434", {
    reqheaders: { authorization: "Bearer fixture-secret" },
  })
    .post(
      "/v1/chat/completions",
      (request) =>
        request.model === "my-local-model" &&
        request.messages.some(
          (m: { content: string }) => m.content === "Write a short script",
        ),
    )
    .reply(200, {
      id: "fixture",
      object: "chat.completion",
      created: 1,
      model: "my-local-model",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "A script from the provider" },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 },
    });
  const settings = SettingsSchema.parse({
    ai: {
      mode: "api",
      provider: "compatible",
      model: "my-local-model",
      baseUrl: "http://127.0.0.1:11434/v1",
      apiKey: "fixture-secret",
    },
  });
  expect(await apiText(settings.ai, "Write a short script")).toBe(
    "A script from the provider",
  );
  expect(scope.isDone()).toBe(true);
});

it("shows a useful API error without exposing the configured key", async () => {
  nock("http://127.0.0.1:11434")
    .post("/v1/chat/completions")
    .reply(401, { error: { message: "fixture-secret" } });
  const settings = SettingsSchema.parse({
    ai: {
      mode: "api",
      provider: "compatible",
      model: "fixture",
      apiKey: "fixture-secret",
    },
  });
  await expect(apiText(settings.ai, "Test")).rejects.toThrow(
    /Kiểm tra endpoint/,
  );
  await expect(apiText({ ...settings.ai, model: "" }, "Test")).rejects.toThrow(
    /model/,
  );
});
