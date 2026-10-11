/*
  Medville Brace dashboard API: the AWS Lambda behind POST /admin.

  Path of a dashboard request: browser -> API Gateway HTTP API (a JWT
  authorizer checks the Cognito ID token) -> this function -> DynamoDB
  (orders and the access log, both KMS encrypted) and Cognito (staff
  accounts). All HIPAA eligible services under the account's AWS BAA.

  Bundled by scripts/build-aws.mjs; the AWS SDK comes from the Lambda runtime.
*/
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import * as Cognito from "@aws-sdk/client-cognito-identity-provider";
import { createAdminHandler } from "./admin.mjs";
import { createUsers } from "./users.mjs";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
const cognito = new Cognito.CognitoIdentityProviderClient({});
const DB_COMMANDS = { Get: GetCommand, Put: PutCommand, Query: QueryCommand, TransactWrite: TransactWriteCommand };

const users = createUsers({
  send: (kind, input) => cognito.send(new Cognito[`${kind}Command`](input)),
  userPoolId: process.env.USER_POOL_ID,
});

export const handler = createAdminHandler({
  origins: (process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean),
  db: { send: (kind, input) => dynamo.send(new DB_COMMANDS[kind](input)) },
  users,
  ordersTable: process.env.ORDERS_TABLE,
  auditTable: process.env.AUDIT_TABLE,
  defaultTimeZone: process.env.BUSINESS_TIME_ZONE || "America/New_York",
});
