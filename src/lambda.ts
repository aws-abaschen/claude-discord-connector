import { timingSafeEqual } from "node:crypto";
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { LambdaFunctionURLEvent } from "aws-lambda";
import { Discord } from "./discord.js";
import { createServer, optionsFromEnv } from "./server.js";

type Result = { statusCode: number; headers: Record<string, string>; body: string };

interface Secret {
  discordBotToken: string;
  mcpAuthToken: string;
}

let secret: Promise<Secret> | undefined;

// Cached per container. Reset on failure so the next call retries.
const loadSecret = () =>
  (secret ??= new SecretsManagerClient({})
    .send(new GetSecretValueCommand({ SecretId: process.env.SECRET_ARN }))
    .then((r) => JSON.parse(r.SecretString ?? "{}") as Secret)
    .catch((e) => {
      secret = undefined;
      throw e;
    }));

export const authorized = (header: string | undefined, token: string) => {
  const given = Buffer.from(header?.replace(/^Bearer\s+/i, "") ?? "");
  const want = Buffer.from(token);
  return want.length > 0 && given.length === want.length && timingSafeEqual(given, want);
};

const json = (statusCode: number, body: unknown): Result => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export async function handler(event: LambdaFunctionURLEvent): Promise<Result> {
  const { discordBotToken, mcpAuthToken } = await loadSecret();
  if (!authorized(event.headers.authorization, mcpAuthToken)) return json(401, { error: "unauthorized" });

  const method = event.requestContext.http.method;
  // Stateless server: no SSE stream (GET) and no sessions (DELETE).
  if (method !== "POST") return json(405, { error: "method not allowed" });

  const body = event.body && event.isBase64Encoded ? Buffer.from(event.body, "base64").toString() : event.body;
  const request = new Request(`https://${event.requestContext.domainName}${event.rawPath}`, {
    method,
    headers: event.headers as Record<string, string>,
    body,
  });

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const server = createServer(new Discord(discordBotToken), optionsFromEnv());
  await server.connect(transport);
  try {
    const res = await transport.handleRequest(request);
    return { statusCode: res.status, headers: Object.fromEntries(res.headers), body: await res.text() };
  } finally {
    await server.close();
  }
}
