#!/usr/bin/env bash
# Exchange the GitHub OIDC token for AWS credentials and export them to later steps.
set -euo pipefail

token=$(curl -sSf -H "Authorization: bearer ${ACTIONS_ID_TOKEN_REQUEST_TOKEN}" \
  "${ACTIONS_ID_TOKEN_REQUEST_URL}&audience=sts.amazonaws.com" | jq -r .value)

creds=$(aws sts assume-role-with-web-identity \
  --role-arn "${ROLE_ARN}" \
  --role-session-name "gha-${GITHUB_RUN_ID}" \
  --web-identity-token "${token}" \
  --query Credentials --output json)

for kv in "AWS_ACCESS_KEY_ID=AccessKeyId" "AWS_SECRET_ACCESS_KEY=SecretAccessKey" "AWS_SESSION_TOKEN=SessionToken"; do
  val=$(jq -r ".${kv#*=}" <<<"${creds}")
  echo "::add-mask::${val}"
  echo "${kv%%=*}=${val}" >> "${GITHUB_ENV}"
done
