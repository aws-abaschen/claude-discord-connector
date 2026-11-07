import { Discord } from "./discord.js";
import { createHttpServer } from "./http.js";
import { optionsFromEnv } from "./server.js";
import { botToken } from "./token.js";

const port = Number(process.env.PORT ?? 8000);
const server = createHttpServer(new Discord(botToken()), {
  ...optionsFromEnv(),
  authToken: process.env.MCP_AUTH_TOKEN,
});

server.listen(port, "0.0.0.0", () => console.log(`MCP server on :${port}/mcp`));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => server.close(() => process.exit(0)));
