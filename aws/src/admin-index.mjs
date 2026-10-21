/*
  Medville Brace dashboard API: the AWS Lambda behind POST /admin.

  Path of a dashboard request: browser -> API Gateway HTTP API (a JWT
  authorizer checks the Firebase ID token) -> this function -> DynamoDB
  (orders and the access log, both KMS encrypted). All HIPAA eligible
  services under the account's AWS BAA.

  Outside calls carry no order detail: Firebase Authentication (to read and
  manage staff accounts, signed with the service account key from Secrets
  Manager) and, when an owner or staff member publishes store changes, the
  website's Vercel deploy hook.

  Bundled by scripts/build-aws.mjs; the AWS SDK comes from the Lambda runtime.
*/
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { createAdminHandler } from "./admin.mjs";
import { createIdentity, identityCall } from "./identity.mjs";
import { createGoogleAuth } from "./firestore.mjs";
import { googleKey } from "./google-key.mjs";
import { createPublisher } from "./publish.mjs";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
const DB_COMMANDS = { Get: GetCommand, Put: PutCommand, Query: QueryCommand, TransactWrite: TransactWriteCommand };

let auth = null;
const token = async () => {
  auth ??= createGoogleAuth(await googleKey(), { scope: "https://www.googleapis.com/auth/identitytoolkit" });
  return auth();
};

const hook = process.env.DEPLOY_HOOK_URL || "";

export const handler = createAdminHandler({
  origins: (process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean),
  db: { send: (kind, input) => dynamo.send(new DB_COMMANDS[kind](input)) },
  users: createIdentity({ call: identityCall({ projectId: process.env.FIREBASE_PROJECT_ID, token }) }),
  ordersTable: process.env.ORDERS_TABLE,
  auditTable: process.env.AUDIT_TABLE,
  defaultTimeZone: process.env.BUSINESS_TIME_ZONE || "America/New_York",
  publish: hook.startsWith("https://") ? createPublisher(hook) : null,
});
