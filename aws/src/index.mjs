/*
  Medville Brace order intake: the AWS Lambda behind POST /orders.

  Path of an order request: browser -> API Gateway HTTP API -> this function
  -> DynamoDB table medville-brace-orders (KMS encrypted). All of these are
  HIPAA eligible services under the account's AWS BAA. The website itself is on
  Vercel and never sees order data.

  The one outside call is a read of the public store/catalog document in
  Firestore (prices, stock and hidden products set in the dashboard). It
  sends nothing: no order detail ever leaves AWS.

  Nothing here logs request bodies. Errors returned to the browser never repeat
  what was submitted. Bundled by scripts/build-aws.mjs; the AWS SDK comes from
  the Lambda runtime.
*/
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, TransactWriteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { createOrderHandler, referenceFor } from "./order.mjs";
import { createStore } from "./store.mjs";
import { sendNotification } from "./notification.mjs";
import { createLiveCatalog } from "./content.mjs";
import { createFirestore } from "./firestore.mjs";
/* Written by scripts/build-catalog.mjs: the server's own copy of names, variants and prices. */
import catalog from "../catalog.json" with { type: "json" };

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
const ses = new SESv2Client({});
const COMMANDS = { Get: GetCommand, TransactWrite: TransactWriteCommand, Update: UpdateCommand };

const projectId = process.env.FIREBASE_PROJECT_ID;
const firestore = projectId ? createFirestore({ projectId, timeoutMs: 2500 }) : null;
const liveCatalog = firestore ? createLiveCatalog({ catalog, read: () => firestore.get("store/catalog") }) : async () => catalog;

const store = createStore({
  send: (kind, input) => db.send(new COMMANDS[kind](input)),
  ordersTable: process.env.ORDERS_TABLE,
  limitsTable: process.env.LIMITS_TABLE,
  secret: process.env.RATE_LIMIT_SECRET,
});

export const handler = createOrderHandler({
  origins: (process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean),
  enabled: process.env.ORDERS_ENABLED === "true",
  catalog,
  liveCatalog,
  save: store.save,
  notify: async (order) => {
    let status = "failed";
    try {
      status = await sendNotification(
        { reference: referenceFor(order.submissionId), itemCount: order.items.reduce((n, l) => n + l.qty, 0) },
        (input) => ses.send(new SendEmailCommand(input)),
      );
    } catch {
      console.error("order notification failed");
    }
    await store.setNotificationStatus(order.submissionId, status);
  },
});
