import { App } from "aws-cdk-lib";
import { DiscordMcpStack } from "./stack.js";

const app = new App();
const ctx = (key: string, fallback?: string) => {
  const value = app.node.tryGetContext(key) ?? process.env[key.toUpperCase().replaceAll("-", "_")] ?? fallback;
  if (value === undefined) throw new Error(`Missing context -c ${key}=...`);
  return String(value);
};

new DiscordMcpStack(app, "aws-discord-mcp", {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
  discordClientId: ctx("discord-client-id"),
  discordClientSecretName: ctx("discord-client-secret-name", "aws-discord-mcp/discord-client-secret"),
  botTokenSecretName: ctx("bot-token-secret-name", "aws-discord-mcp/discord-bot-token"),
  callbackPort: Number(ctx("callback-port", "8765")),
  readOnly: ctx("read-only", "false") === "true",
  allowedGuilds: ctx("allowed-guilds", "").split(",").filter(Boolean),
});
