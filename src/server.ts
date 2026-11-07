import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Channel, Discord, Message } from "./discord.js";

const snowflake = z.string().regex(/^\d{17,20}$/, "Discord ID (snowflake)");

const CHANNEL_TYPES: Record<number, string> = {
  0: "text",
  2: "voice",
  4: "category",
  5: "announcement",
  10: "announcement-thread",
  11: "public-thread",
  12: "private-thread",
  13: "stage",
  15: "forum",
  16: "media",
};

const text = (value: unknown) => ({
  content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
});

const channel = (c: Channel) => ({
  id: c.id,
  name: c.name,
  type: CHANNEL_TYPES[c.type] ?? c.type,
  parent_id: c.parent_id ?? undefined,
  topic: c.topic || undefined,
});

const message = (m: Message) => ({
  id: m.id,
  at: m.timestamp,
  author: m.author.global_name ?? m.author.username,
  author_id: m.author.id,
  bot: m.author.bot || undefined,
  content: m.content,
  reply_to: m.referenced_message?.id,
  attachments: m.attachments?.length ? m.attachments.map((a) => a.url) : undefined,
  thread_id: m.thread?.id,
});

export interface Options {
  readOnly?: boolean;
  allowedGuilds?: string[];
}

export function createServer(discord: Discord, opts: Options = {}) {
  const server = new McpServer({ name: "discord", version: "1.0.0" });
  const allowed = opts.allowedGuilds?.length ? new Set(opts.allowedGuilds) : undefined;

  const checkGuild = (id: string) => {
    if (allowed && !allowed.has(id)) throw new Error(`Guild ${id} is not allowed`);
  };

  // Channel tools must not escape the guild allow-list.
  const checkChannel = async (id: string) => {
    if (!allowed) return;
    const c = await discord.getChannel(id);
    if (!c.guild_id || !allowed.has(c.guild_id)) throw new Error(`Channel ${id} is not allowed`);
  };

  server.registerTool(
    "list_guilds",
    { description: "List Discord servers (guilds) the bot is in.", annotations: { readOnlyHint: true } },
    async () => {
      const guilds = await discord.listGuilds();
      return text(guilds.filter((g) => !allowed || allowed.has(g.id)).map((g) => ({ id: g.id, name: g.name })));
    },
  );

  server.registerTool(
    "list_channels",
    {
      description: "List channels and active threads of a guild.",
      inputSchema: { guild_id: snowflake },
      annotations: { readOnlyHint: true },
    },
    async ({ guild_id }) => {
      checkGuild(guild_id);
      const [channels, threads] = await Promise.all([
        discord.listChannels(guild_id),
        discord.listActiveThreads(guild_id).catch(() => ({ threads: [] as Channel[] })),
      ]);
      return text({ channels: channels.map(channel), threads: threads.threads.map(channel) });
    },
  );

  server.registerTool(
    "read_messages",
    {
      description: "Read recent messages of a channel or thread, newest first.",
      inputSchema: {
        channel_id: snowflake,
        limit: z.number().int().min(1).max(100).default(50),
        before: snowflake.optional().describe("Only messages before this message ID"),
        after: snowflake.optional().describe("Only messages after this message ID"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ channel_id, ...rest }) => {
      await checkChannel(channel_id);
      return text((await discord.readMessages(channel_id, rest)).map(message));
    },
  );

  if (opts.readOnly) return server;

  server.registerTool(
    "send_message",
    {
      description: "Send a message to a channel or thread. Mentions do not ping.",
      inputSchema: {
        channel_id: snowflake,
        content: z.string().min(1).max(2000),
        reply_to: snowflake.optional().describe("Message ID to reply to"),
      },
    },
    async ({ channel_id, content, reply_to }) => {
      await checkChannel(channel_id);
      return text(message(await discord.sendMessage(channel_id, content, reply_to)));
    },
  );

  server.registerTool(
    "edit_message",
    {
      description: "Edit a message sent by the bot.",
      inputSchema: { channel_id: snowflake, message_id: snowflake, content: z.string().min(1).max(2000) },
    },
    async ({ channel_id, message_id, content }) => {
      await checkChannel(channel_id);
      return text(message(await discord.editMessage(channel_id, message_id, content)));
    },
  );

  server.registerTool(
    "delete_message",
    {
      description: "Delete a message.",
      inputSchema: { channel_id: snowflake, message_id: snowflake },
      annotations: { destructiveHint: true },
    },
    async ({ channel_id, message_id }) => {
      await checkChannel(channel_id);
      await discord.deleteMessage(channel_id, message_id);
      return text("deleted");
    },
  );

  server.registerTool(
    "add_reaction",
    {
      description: "React to a message. Emoji is unicode (👍) or custom as name:id.",
      inputSchema: { channel_id: snowflake, message_id: snowflake, emoji: z.string().min(1) },
    },
    async ({ channel_id, message_id, emoji }) => {
      await checkChannel(channel_id);
      await discord.addReaction(channel_id, message_id, emoji);
      return text("ok");
    },
  );

  server.registerTool(
    "create_thread",
    {
      description: "Create a thread, from a message or standalone in a text channel.",
      inputSchema: {
        channel_id: snowflake,
        name: z.string().min(1).max(100),
        message_id: snowflake.optional().describe("Start the thread from this message"),
      },
    },
    async ({ channel_id, name, message_id }) => {
      await checkChannel(channel_id);
      return text(channel(await discord.createThread(channel_id, name, message_id)));
    },
  );

  return server;
}

export function optionsFromEnv(env = process.env): Options {
  return {
    readOnly: env.DISCORD_READ_ONLY === "true",
    allowedGuilds: env.DISCORD_ALLOWED_GUILDS?.split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}
