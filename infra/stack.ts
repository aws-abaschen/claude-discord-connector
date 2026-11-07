import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Annotations, Aws, CfnOutput, Duration, RemovalPolicy, SecretValue, Stack, type StackProps } from "aws-cdk-lib";
import * as agentcore from "aws-cdk-lib/aws-bedrockagentcore";
import * as cognito from "aws-cdk-lib/aws-cognito";
import { Platform } from "aws-cdk-lib/aws-ecr-assets";
import * as secrets from "aws-cdk-lib/aws-secretsmanager";
import type { Construct } from "constructs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

export interface DiscordMcpStackProps extends StackProps {
  /** Discord application (OAuth2) client ID, used for login. */
  discordClientId: string;
  /** Secrets Manager secret name holding the Discord OAuth2 client secret (plain string). */
  discordClientSecretName: string;
  /** Secrets Manager secret name holding the Discord bot token (plain string). */
  botTokenSecretName: string;
  /** Local port Claude Code listens on for the OAuth callback. */
  callbackPort: number;
  readOnly: boolean;
  allowedGuilds: string[];
}

export class DiscordMcpStack extends Stack {
  constructor(scope: Construct, id: string, props: DiscordMcpStackProps) {
    super(scope, id, props);
    if (!props.discordClientId) Annotations.of(this).addError("Set the Discord client ID: -c discord-client-id=...");

    const botToken = secrets.Secret.fromSecretNameV2(this, "BotToken", props.botTokenSecretName);

    // Users sign in with Discord. Cognito issues the JWT the Gateway validates,
    // because Discord access tokens are opaque.
    const userPool = new cognito.UserPool(this, "Users", {
      selfSignUpEnabled: false,
      signInAliases: { username: true },
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const discord = new cognito.UserPoolIdentityProviderOidc(this, "Discord", {
      userPool,
      name: "Discord",
      issuerUrl: "https://discord.com",
      clientId: props.discordClientId,
      clientSecret: SecretValue.secretsManager(props.discordClientSecretName).unsafeUnwrap(),
      scopes: ["openid", "identify", "email"],
      attributeRequestMethod: cognito.OidcAttributeRequestMethod.GET,
      attributeMapping: {
        email: cognito.ProviderAttribute.other("email"),
        preferredUsername: cognito.ProviderAttribute.other("username"),
      },
    });

    const domain = userPool.addDomain("Domain", {
      cognitoDomain: { domainPrefix: `discord-mcp-${Aws.ACCOUNT_ID}` },
    });

    const client = userPool.addClient("ClaudeCode", {
      generateSecret: false,
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.custom(discord.providerName)],
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: [`http://localhost:${props.callbackPort}/callback`],
      },
      accessTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(30),
    });
    client.node.addDependency(discord);

    // MCP server container. Private: only the Gateway role can invoke it (IAM).
    const runtime = new agentcore.Runtime(this, "Runtime", {
      runtimeName: "aws_discord_mcp",
      description: "Discord MCP server",
      agentRuntimeArtifact: agentcore.AgentRuntimeArtifact.fromAsset(root, { platform: Platform.LINUX_ARM64 }),
      protocolConfiguration: agentcore.ProtocolType.MCP,
      environmentVariables: {
        DISCORD_BOT_TOKEN_SECRET: botToken.secretName,
        DISCORD_READ_ONLY: String(props.readOnly),
        DISCORD_ALLOWED_GUILDS: props.allowedGuilds.join(","),
      },
    });
    botToken.grantRead(runtime.role);

    const gateway = new agentcore.Gateway(this, "Gateway", {
      gatewayName: "aws-discord-mcp",
      description: "Discord MCP for Claude Code",
      protocolConfiguration: agentcore.GatewayProtocol.mcp({
        supportedVersions: [agentcore.MCPProtocolVersion.MCP_2025_06_18],
      }),
      authorizerConfiguration: agentcore.GatewayAuthorizer.usingCognito({ userPool, allowedClients: [client] }),
    });
    runtime.grantInvokeRuntime(gateway.role);

    // Runtime MCP endpoint. The ARN must be URL-encoded in the path.
    const encodedArn = `arn%3A${Aws.PARTITION}%3Abedrock-agentcore%3A${Aws.REGION}%3A${Aws.ACCOUNT_ID}%3Aruntime%2F${runtime.agentRuntimeId}`;
    const target = gateway.addMcpServerTarget("Discord", {
      gatewayTargetName: "discord",
      description: "Discord tools",
      endpoint: `https://bedrock-agentcore.${Aws.REGION}.amazonaws.com/runtimes/${encodedArn}/invocations?qualifier=DEFAULT`,
      credentialProviderConfigurations: [
        agentcore.GatewayCredentialProvider.fromIamRole({ service: "bedrock-agentcore" }),
      ],
    });
    target.node.addDependency(runtime);

    new CfnOutput(this, "McpUrl", { value: gateway.gatewayUrl ?? "" });
    new CfnOutput(this, "ClientId", { value: client.userPoolClientId });
    new CfnOutput(this, "DiscordRedirectUri", { value: `${domain.baseUrl()}/oauth2/idpresponse` });
  }
}
