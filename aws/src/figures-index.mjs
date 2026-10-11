/*
  Medville Brace daily figures: the AWS Lambda that keeps figures/<day> in
  Firestore up to date.

  Triggered by the orders table's stream, which carries keys only. Also
  invoked by hand with { "rebuild": { "from": "YYYY-MM-DD", "to": "YYYY-MM-DD" } }
  (npm run figures:rebuild) to fill or repair a range of days.

  Reads from DynamoDB only the fields in FIGURE_READ (see figures.mjs) and
  sends Google only counts and sums. Bundled by scripts/build-aws.mjs.
*/
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { createFigures } from "./figures.mjs";
import { createFirestore, createGoogleAuth } from "./firestore.mjs";
import { googleKey } from "./google-key.mjs";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const COMMANDS = { Get: GetCommand, Query: QueryCommand };
const firestore = createFirestore({ projectId: process.env.FIREBASE_PROJECT_ID });
let token = null;

const figures = createFigures({
  db: { send: (kind, input) => dynamo.send(new COMMANDS[kind](input)) },
  ordersTable: process.env.ORDERS_TABLE,
  timeZone: process.env.BUSINESS_TIME_ZONE || "America/New_York",
  write: async (docs) => {
    token ??= createGoogleAuth(await googleKey(), { scope: "https://www.googleapis.com/auth/datastore" });
    await firestore.setAll(docs, await token());
  },
});

export async function handler(event) {
  try {
    if (Array.isArray(event?.Records)) return await figures.fromStream(event.Records);
    if (event?.rebuild) return await figures.rebuild(event.rebuild.from, event.rebuild.to);
    return { days: 0 };
  } catch (error) {
    /* A stream batch that fails is retried by Lambda; the message names no order. */
    console.error("figures update failed", { reason: error instanceof Error ? error.message.slice(0, 60) : "unknown" });
    throw new Error("figures update failed");
  }
}
