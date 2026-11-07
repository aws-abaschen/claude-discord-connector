#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Discord } from "./discord.js";
import { createServer, optionsFromEnv } from "./server.js";
import { botToken } from "./token.js";

await createServer(new Discord(botToken()), optionsFromEnv()).connect(new StdioServerTransport());
