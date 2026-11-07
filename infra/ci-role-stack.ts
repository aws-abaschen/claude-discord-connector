import { Stack, type StackProps } from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import type { Construct } from "constructs";

export interface CiRoleStackProps extends StackProps {
  /** Repository name inside the org. */
  repo: string;
  /** Stacks the role may describe. */
  stacks: string[];
  /** GitHub environment the deploy job runs in. */
  environment: string;
}

const ORG = "baschenis-cloud-ci";
const ORG_ID = "342063361";

/** Role assumed by GitHub Actions via OIDC. It can only use the CDK bootstrap roles. */
export class CiRoleStack extends Stack {
  constructor(scope: Construct, id: string, props: CiRoleStackProps) {
    super(scope, id, props);

    const provider = iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
      this,
      "GithubOidc",
      `arn:aws:iam::${this.account}:oidc-provider/token.actions.githubusercontent.com`,
    );

    // Same subjects as the other repos of the org: plain and immutable (owner@id/repo@id) forms.
    const subjects = [`${ORG}/${props.repo}`, `${ORG}@${ORG_ID}/${props.repo}@*`].flatMap((r) => [
      `repo:${r}:pull_request`,
      `repo:${r}:environment:${props.environment}`,
    ]);

    const role = new iam.Role(this, "DeployRole", {
      roleName: `github-actions-${props.repo}`,
      assumedBy: new iam.WebIdentityPrincipal(provider.openIdConnectProviderArn, {
        StringEquals: { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
        StringLike: { "token.actions.githubusercontent.com:sub": subjects },
      }),
    });
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["sts:AssumeRole"],
        resources: [`arn:aws:iam::${this.account}:role/cdk-hnb659fds-*-${this.account}-*`],
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["cloudformation:DescribeStacks", "cloudformation:GetTemplate"],
        resources: props.stacks.map((s) => `arn:aws:cloudformation:*:${this.account}:stack/${s}/*`),
      }),
    );
  }
}
