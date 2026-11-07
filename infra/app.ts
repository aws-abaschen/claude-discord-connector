import { App, Tags } from "aws-cdk-lib";
import { CiRoleStack } from "./ci-role-stack.js";
import { DiscordMcpStack } from "./stack.js";

const app = new App();
const ctx = (key: string, fallback?: string) => {
  const value = app.node.tryGetContext(key) ?? process.env[key.toUpperCase().replaceAll("-", "_")] ?? fallback;
  if (value === undefined) throw new Error(`Missing context -c ${key}=...`);
  return String(value);
};

const env = { account: "067751999967", region: ctx("region", process.env.AWS_REGION ?? "eu-west-1") };

new DiscordMcpStack(app, "aws-discord-mcp", {
  env,
  discordClientId: ctx("discord-client-id", ""),
  botTokenSecretName: ctx("bot-token-secret-name", "aws-discord-mcp/discord-bot-token"),
  callbackPort: Number(ctx("callback-port", "8765")),
  readOnly: ctx("read-only", "false") === "true",
  allowedGuilds: ctx("allowed-guilds", "").split(",").filter(Boolean),
});

// Deployed once by hand with an admin profile: npm run ci-role
new CiRoleStack(app, "DiscordMcpCiRole", {
  env,
  repo: "discord-mcp",
  stacks: ["aws-discord-mcp"],
  environment: "discord",
});

Tags.of(app).add("repo", "baschenis-cloud-ci/discord-mcp");
