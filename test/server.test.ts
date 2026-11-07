import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";
import { Discord } from "../src/discord.js";
import { authorized } from "../src/lambda.js";
import { createServer, type Options } from "../src/server.js";

const GUILD = "111111111111111111";
const OTHER = "222222222222222222";
const CHAN = "333333333333333333";

function setup(opts: Options = {}) {
  const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const path = String(url).replace("https://discord.com/api/v10", "");
    const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
    if (path === "/users/@me/guilds") return reply([{ id: GUILD, name: "a" }, { id: OTHER, name: "b" }]);
    if (path === `/channels/${CHAN}`) return reply({ id: CHAN, guild_id: GUILD, type: 0 });
    if (path.startsWith(`/channels/${CHAN}/messages`) && init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      return reply({ id: "1", channel_id: CHAN, content: body.content, timestamp: "t", author: { id: "9", username: "bot", bot: true } });
    }
    return reply({ message: "not found" }, 404);
  });
  const server = createServer(new Discord("token", fetchFn as typeof fetch), opts);
  return { server, fetchFn };
}

async function connect(opts: Options = {}) {
  const { server, fetchFn } = setup(opts);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "1" });
  await Promise.all([server.connect(a), client.connect(b)]);
  return { client, fetchFn };
}

const textOf = (r: Awaited<ReturnType<Client["callTool"]>>) => (r.content as { text: string }[])[0].text;

describe("server", () => {
  it("lists all tools", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      ["add_reaction", "create_thread", "delete_message", "edit_message", "list_channels", "list_guilds", "read_messages", "send_message"],
    );
  });

  it("hides write tools in read-only mode", async () => {
    const { client } = await connect({ readOnly: true });
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["list_channels", "list_guilds", "read_messages"]);
  });

  it("filters guilds by allow-list", async () => {
    const { client } = await connect({ allowedGuilds: [GUILD] });
    const r = await client.callTool({ name: "list_guilds", arguments: {} });
    expect(JSON.parse(textOf(r))).toEqual([{ id: GUILD, name: "a" }]);
  });

  it("blocks guilds outside the allow-list", async () => {
    const { client } = await connect({ allowedGuilds: [OTHER] });
    const r = await client.callTool({ name: "send_message", arguments: { channel_id: CHAN, content: "hi" } });
    expect(r.isError).toBe(true);
  });

  it("sends messages without pinging", async () => {
    const { client, fetchFn } = await connect({ allowedGuilds: [GUILD] });
    const r = await client.callTool({ name: "send_message", arguments: { channel_id: CHAN, content: "hi @everyone" } });
    expect(JSON.parse(textOf(r)).content).toBe("hi @everyone");
    const body = JSON.parse(String(fetchFn.mock.calls.at(-1)![1]!.body));
    expect(body.allowed_mentions).toEqual({ parse: [] });
  });
});

describe("authorized", () => {
  it("checks the bearer token", () => {
    expect(authorized("Bearer abc", "abc")).toBe(true);
    expect(authorized("Bearer abd", "abc")).toBe(false);
    expect(authorized(undefined, "abc")).toBe(false);
    expect(authorized("Bearer ", "")).toBe(false);
  });
});
