# claude-discord-connector

Discord connector for Claude Code. An MCP server that lets Claude read and post in Discord through a bot.

Runs serverless on AWS Lambda (Function URL, stateless Streamable HTTP), or locally over stdio.

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

## 1. Create the Discord bot

1. https://discord.com/developers/applications → New Application → Bot.
2. Reset and copy the token.
3. Enable **Message Content Intent**.
4. OAuth2 → URL Generator: scope `bot`, permissions `View Channels`, `Read Message History`, `Send Messages`, `Send Messages in Threads`, `Create Public Threads`, `Add Reactions`. Open the URL to invite the bot.

## 2a. Deploy on AWS

Needs the [SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html) and the `aws-abaschen` profile.

```sh
npm ci
npm run deploy
```

Set both tokens in the secret. `mcpAuthToken` is the bearer token Claude Code sends; pick a random one.

```sh
export AWS_PROFILE=aws-abaschen
MCP_TOKEN=$(openssl rand -hex 32)
ARN=$(aws cloudformation describe-stacks --stack-name claude-discord-connector \
  --query "Stacks[0].Outputs[?OutputKey=='SecretArn'].OutputValue" --output text)
aws secretsmanager put-secret-value --secret-id "$ARN" \
  --secret-string "{\"discordBotToken\":\"$DISCORD_BOT_TOKEN\",\"mcpAuthToken\":\"$MCP_TOKEN\"}"
```

Add it to Claude Code:

```sh
URL=$(aws cloudformation describe-stacks --stack-name claude-discord-connector \
  --query "Stacks[0].Outputs[?OutputKey=='McpUrl'].OutputValue" --output text)
claude mcp add --transport http discord "$URL" --header "Authorization: Bearer $MCP_TOKEN"
```

Warm Lambdas cache the secret. After rotating it, redeploy or wait for new instances.

Deploy options: `sam deploy --parameter-overrides ReadOnly=true AllowedGuilds=123,456`.

## 2b. Run locally

```sh
npm ci && npm run build
claude mcp add discord -e DISCORD_BOT_TOKEN=xxx -- node "$(pwd)/dist/stdio.mjs"
```

## Develop

```sh
npm test
npm run typecheck
```
