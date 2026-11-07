import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, expect, it } from "vitest";
import { Discord } from "../src/discord.js";
import { authorized, createHttpServer } from "../src/http.js";

const server = createHttpServer(new Discord(async () => "x"), { authToken: "secret" });
let url: string;

beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const rpc = (body: unknown, auth = "Bearer secret") =>
  fetch(`${url}/mcp`, {
    method: "POST",
    headers: { authorization: auth, "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify(body),
  });

it("answers ping", async () => {
  expect((await fetch(`${url}/ping`)).status).toBe(200);
});

it("rejects a bad token", async () => {
  expect((await rpc({}, "Bearer nope")).status).toBe(401);
});

it("answers initialize", async () => {
  const res = await rpc({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } },
  });
  expect(res.status).toBe(200);
  expect((await res.json()).result.serverInfo.name).toBe("discord");
});

it("lists tools without a session", async () => {
  const res = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  expect((await res.json()).result.tools).toHaveLength(8);
});

it("checks the bearer token", () => {
  expect(authorized("Bearer abc", "abc")).toBe(true);
  expect(authorized("Bearer abd", "abc")).toBe(false);
  expect(authorized(undefined, "abc")).toBe(false);
  expect(authorized("Bearer ", "")).toBe(false);
});
