/*
  Medville Brace order intake: the AWS Lambda behind POST /orders.

  Path of an order request: browser -> API Gateway HTTP API -> this function
  -> DynamoDB table medville-brace-orders (KMS encrypted). All of these are
  HIPAA eligible services under the account's AWS BAA. The website itself is on
  Cloudflare and never sees order data.

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
/* Written by scripts/build-catalog.mjs: the server's own copy of names, variants and prices. */
import catalog from "../catalog.json" with { type: "json" };

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
const ses = new SESv2Client({});
const COMMANDS = { Get: GetCommand, TransactWrite: TransactWriteCommand, Update: UpdateCommand };

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
