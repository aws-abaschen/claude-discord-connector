# aws-discord-mcp

Discord MCP server for Claude Code. Lets Claude read and post in Discord through a bot.

Run it locally with Docker, or host it on AWS with Amazon Bedrock AgentCore.

## Tools

| Tool | What it does |
| --- | --- |
| `list_guilds` | Servers the bot is in |
| `list_channels` | Channels and active threads of a server |
| `read_messages` | Recent messages of a channel or thread |
| `send_message` | Post or reply (mentions never ping) |
| `edit_message` | Edit a bot message |
| `delete_message` | Delete a message |
| `add_reaction` | React to a message |
| `create_thread` | Start a thread |

`DISCORD_READ_ONLY=true` exposes only the read tools.
`DISCORD_ALLOWED_GUILDS=id1,id2` restricts servers.

## Discord application

1. https://discord.com/developers/applications → New Application.
2. **Bot**: reset and copy the token. Enable **Message Content Intent**.
3. **OAuth2 → URL Generator**: scope `bot`, permissions `View Channels`, `Read Message History`, `Send Messages`, `Send Messages in Threads`, `Create Public Threads`, `Add Reactions`. Open the URL to invite the bot.
4. For AWS only: **OAuth2** gives the client ID and client secret used for login.

## Local (Docker)

```sh
export DISCORD_BOT_TOKEN=xxx
export MCP_AUTH_TOKEN=$(openssl rand -hex 32)   # optional
docker compose up -d --build
claude mcp add --transport http discord http://localhost:8000/mcp \
  --header "Authorization: Bearer $MCP_AUTH_TOKEN"
```

Or without Docker, over stdio:

```sh
npm ci && npm run build
claude mcp add discord -e DISCORD_BOT_TOKEN=xxx -- node "$(pwd)/dist/stdio.mjs"
```

## AWS (AgentCore)

```
Claude Code ──OAuth (Discord login via Cognito)──▶ AgentCore Gateway ──SigV4──▶ AgentCore Runtime (container) ──▶ Discord API
```

- **Gateway**: public MCP endpoint. Validates the Cognito JWT.
- **Cognito**: login with Discord as OIDC provider. Discord access tokens are opaque, so Cognito issues the JWT.
- **Runtime**: runs the container. Only the Gateway role can invoke it.
- **Secrets Manager**: bot token. The Discord client secret is a NoEcho stack parameter.

### 1. Secrets

Bot token, in Secrets Manager (plain string), once:

```sh
aws secretsmanager create-secret --name aws-discord-mcp/discord-bot-token --secret-string "$DISCORD_BOT_TOKEN"
```

Discord client secret: GitHub secret `DISCORD_CLIENT_SECRET`. The deploy passes it as a NoEcho stack parameter.

### 2. Deploy

GitHub Actions (`.github/workflows/deploy.yml`) deploys on push to `main`, in the `aws` environment. It follows the org rules: GitHub-owned actions pinned to a SHA, and OIDC login with `scripts/ci-aws-login.sh` into role `github-actions-discord-mcp`.

One-time setup:

1. `npm run ci-role` with an admin profile. It creates the GitHub Actions role.
2. Run `just apply` in `github-config` so the repo gets its `aws` environment (`AWS_ACCOUNT_ID`, `AWS_REGION`).
3. Add the GitHub variable `DISCORD_CLIENT_ID` and the GitHub secret `DISCORD_CLIENT_SECRET`. Optional: `DISCORD_READ_ONLY`, `DISCORD_ALLOWED_GUILDS`.

Or from your machine (needs Docker for the arm64 image):

```sh
npm ci
DISCORD_CLIENT_ID=<id> DISCORD_CLIENT_SECRET=<secret> npm run deploy
```

### 3. Discord redirect

Add the `DiscordRedirectUri` stack output to **OAuth2 → Redirects** of the Discord application.

### 4. Claude Code

```sh
claude mcp add --transport http discord <McpUrl output> \
  --client-id <ClientId output> --callback-port 8765
```

Then run `/mcp` in Claude Code and sign in with Discord.

## Develop

```sh
npm test
npm run typecheck
npx cdk synth -c discord-client-id=0
```
