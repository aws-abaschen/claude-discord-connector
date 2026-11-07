import type { LambdaFunctionURLEvent } from "aws-lambda";
import { expect, it, vi } from "vitest";

vi.mock("@aws-sdk/client-secrets-manager", () => ({
  GetSecretValueCommand: class {},
  SecretsManagerClient: class {
    send = async () => ({ SecretString: JSON.stringify({ discordBotToken: "x", mcpAuthToken: "secret" }) });
  },
}));

const { handler } = await import("../src/lambda.js");

const event = (auth?: string, body?: unknown) =>
  ({
    rawPath: "/",
    headers: {
      ...(auth ? { authorization: auth } : {}),
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    requestContext: { domainName: "example.com", http: { method: "POST" } },
    body: body ? JSON.stringify(body) : undefined,
    isBase64Encoded: false,
  }) as unknown as LambdaFunctionURLEvent;

it("rejects missing token", async () => {
  expect((await handler(event())).statusCode).toBe(401);
});

it("answers initialize", async () => {
  const res = await handler(
    event("Bearer secret", {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } },
    }),
  );
  expect(res.statusCode).toBe(200);
  expect(JSON.parse(res.body!).result.serverInfo.name).toBe("discord");
});

it("lists tools", async () => {
  const res = await handler(event("Bearer secret", { jsonrpc: "2.0", id: 2, method: "tools/list" }));
  expect(res.statusCode).toBe(200);
  expect(JSON.parse(res.body!).result.tools.length).toBe(8);
});
