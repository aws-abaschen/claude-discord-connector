import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import type { TokenSource } from "./discord.js";

/**
 * Bot token from DISCORD_BOT_TOKEN (local) or from the Secrets Manager
 * secret named by DISCORD_BOT_TOKEN_SECRET (AgentCore). Loaded on first use.
 */
export function botToken(env = process.env): TokenSource {
  if (env.DISCORD_BOT_TOKEN) return env.DISCORD_BOT_TOKEN;
  const secretId = env.DISCORD_BOT_TOKEN_SECRET;
  if (!secretId) throw new Error("Set DISCORD_BOT_TOKEN or DISCORD_BOT_TOKEN_SECRET");

  let cached: Promise<string> | undefined;
  return () =>
    (cached ??= new SecretsManagerClient({})
      .send(new GetSecretValueCommand({ SecretId: secretId }))
      .then((r) => {
        if (!r.SecretString) throw new Error("Bot token secret is empty");
        return r.SecretString.trim();
      })
      .catch((e) => {
        cached = undefined;
        throw e;
      }));
}
