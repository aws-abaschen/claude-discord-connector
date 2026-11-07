import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Discord } from "./discord.js";
import { createServer, optionsFromEnv } from "./server.js";

const token = process.env.DISCORD_BOT_TOKEN;
if (!token) {
  console.error("DISCORD_BOT_TOKEN is required");
  process.exit(1);
}

await createServer(new Discord(token), optionsFromEnv()).connect(new StdioServerTransport());
