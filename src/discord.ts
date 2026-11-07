const API = "https://discord.com/api/v10";

export class DiscordError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export class Discord {
  constructor(
    private token: string,
    private fetchFn: typeof fetch = fetch,
  ) {}

  async call<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const res = await this.fetchFn(`${API}${path}`, {
        method,
        headers: {
          Authorization: `Bot ${this.token}`,
          "Content-Type": "application/json",
          "User-Agent": "DiscordBot (https://github.com/aws-abaschen/claude-discord-connector, 1.0.0)",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (res.status === 429 && attempt < 3) {
        const data = (await res.json().catch(() => ({}))) as { retry_after?: number };
        await new Promise((r) => setTimeout(r, Math.ceil((data.retry_after ?? 1) * 1000)));
        continue;
      }
      if (!res.ok) throw new DiscordError(res.status, `Discord ${method} ${path}: ${res.status} ${await res.text()}`);
      return (res.status === 204 ? undefined : await res.json()) as T;
    }
  }

  listGuilds() {
    return this.call<Guild[]>("GET", "/users/@me/guilds");
  }

  getChannel(channelId: string) {
    return this.call<Channel>("GET", `/channels/${channelId}`);
  }

  listChannels(guildId: string) {
    return this.call<Channel[]>("GET", `/guilds/${guildId}/channels`);
  }

  listActiveThreads(guildId: string) {
    return this.call<{ threads: Channel[] }>("GET", `/guilds/${guildId}/threads/active`);
  }

  readMessages(channelId: string, opts: { limit?: number; before?: string; after?: string }) {
    const q = new URLSearchParams({ limit: String(opts.limit ?? 50) });
    if (opts.before) q.set("before", opts.before);
    if (opts.after) q.set("after", opts.after);
    return this.call<Message[]>("GET", `/channels/${channelId}/messages?${q}`);
  }

  sendMessage(channelId: string, content: string, replyTo?: string) {
    return this.call<Message>("POST", `/channels/${channelId}/messages`, {
      content,
      allowed_mentions: { parse: [] },
      ...(replyTo ? { message_reference: { message_id: replyTo, fail_if_not_exists: false } } : {}),
    });
  }

  editMessage(channelId: string, messageId: string, content: string) {
    return this.call<Message>("PATCH", `/channels/${channelId}/messages/${messageId}`, { content });
  }

  deleteMessage(channelId: string, messageId: string) {
    return this.call<void>("DELETE", `/channels/${channelId}/messages/${messageId}`);
  }

  addReaction(channelId: string, messageId: string, emoji: string) {
    return this.call<void>(
      "PUT",
      `/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`,
    );
  }

  createThread(channelId: string, name: string, messageId?: string) {
    return messageId
      ? this.call<Channel>("POST", `/channels/${channelId}/messages/${messageId}/threads`, { name })
      : this.call<Channel>("POST", `/channels/${channelId}/threads`, { name, type: 11 });
  }
}

export interface Guild {
  id: string;
  name: string;
}

export interface Channel {
  id: string;
  guild_id?: string;
  name?: string;
  type: number;
  parent_id?: string | null;
  topic?: string | null;
}

export interface Message {
  id: string;
  channel_id: string;
  content: string;
  timestamp: string;
  author: { id: string; username: string; global_name?: string | null; bot?: boolean };
  attachments?: { url: string; filename: string }[];
  referenced_message?: Message | null;
  thread?: Channel;
}
