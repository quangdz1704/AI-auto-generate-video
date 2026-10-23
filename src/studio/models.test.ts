import { afterEach, expect, it } from "vitest";
import nock from "nock";
import { discoverModels, normalizeModels } from "./models.js";
import { SettingsSchema } from "./schema.js";
afterEach(() => {
  nock.cleanAll();
});
it("normalizes catalogs and filters Google models that cannot generate text", () => {
  expect(
    normalizeModels(
      {
        models: [
          {
            name: "models/embed",
            supportedGenerationMethods: ["embedContent"],
          },
          {
            name: "models/example",
            displayName: "Example",
            supportedGenerationMethods: ["generateContent"],
          },
        ],
      },
      true,
    ),
  ).toEqual([{ id: "example", name: "Example", description: "example" }]);
  expect(
    normalizeModels({ data: [{ id: "one" }, { id: "one" }] }),
  ).toHaveLength(1);
});
it("lists a compatible provider using the selected endpoint and key without returning credentials", async () => {
  const scope = nock("http://127.0.0.1:11434", {
    reqheaders: { authorization: "Bearer secret" },
  })
    .get("/v1/models")
    .reply(200, { data: [{ id: "local-model" }] });
  const ai = SettingsSchema.parse({
    ai: {
      mode: "api",
      provider: "compatible",
      baseUrl: "http://127.0.0.1:11434/v1",
      apiKey: "secret",
    },
  }).ai;
  const result = await discoverModels(ai);
  expect(scope.isDone()).toBe(true);
  expect(result.models[0].id).toBe("local-model");
  expect(JSON.stringify(result)).not.toContain("secret");
});
it("follows Google pagination and uses the API key header", async () => {
  const scope = nock("https://generativelanguage.googleapis.com", {
    reqheaders: { "x-goog-api-key": "secret" },
  });
  scope
    .get("/v1beta/models")
    .query({ pageSize: 1000 })
    .reply(200, {
      models: [
        {
          name: "models/first",
          supportedGenerationMethods: ["generateContent"],
        },
      ],
      nextPageToken: "next",
    });
  scope
    .get("/v1beta/models")
    .query({ pageSize: 1000, pageToken: "next" })
    .reply(200, {
      models: [
        {
          name: "models/second",
          supportedGenerationMethods: ["generateContent"],
        },
      ],
    });
  const result = await discoverModels(
    SettingsSchema.parse({
      ai: { mode: "api", provider: "google", apiKey: "secret" },
    }).ai,
  );
  expect(result.models.map((m) => m.id)).toEqual(["first", "second"]);
  expect(scope.isDone()).toBe(true);
});
it("redacts upstream API errors and prevents credential-bearing redirects", async () => {
  nock("https://api.openai.com")
    .get("/v1/models")
    .reply(302, "secret", { Location: "https://untrusted.example/models" });
  await expect(
    discoverModels(
      SettingsSchema.parse({ ai: { mode: "api", apiKey: "secret" } }).ai,
    ),
  ).rejects.toThrow("Không lấy được danh sách model");
});
