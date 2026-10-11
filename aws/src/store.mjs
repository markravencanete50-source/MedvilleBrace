/*
  Order storage in DynamoDB.

  send(kind, input) runs one DynamoDB document-client command ("Get",
  "TransactWrite" or "Update"); index.mjs maps it to the AWS SDK, and the
  tests pass a fake. Kept apart so the storage rules can be tested without AWS.

  - An order and its rate-limit count are written in one transaction, so a
    refused request never uses up the limit and a saved one always counts.
  - The limit key is an HMAC of the hour and the address, so no IP address is
    stored. Counters expire through the table's TTL on expiresAt.
*/
import { createHmac } from "node:crypto";
import { fingerprint, referenceFor } from "./order.mjs";

export function createStore({ send, ordersTable, limitsTable, secret, hourlyLimit = 5, now = () => Date.now() }) {
  const existing = async (id) => (await send("Get", { TableName: ordersTable, Key: { id }, ConsistentRead: true })).Item;
  const compare = (item, hash) => (item ? (item.requestHash === hash ? { duplicate: true } : { conflict: true }) : null);

  async function save(order, ip) {
    const hash = fingerprint(order);
    const prior = compare(await existing(order.submissionId), hash);
    if (prior) return prior;

    const t = now();
    const createdAt = new Date(t).toISOString();
    const rateKey = createHmac("sha256", secret).update(`${Math.floor(t / 3600000)}:${ip}`).digest("hex");
    const { submissionId, ...data } = order;
    const item = {
      id: submissionId,
      ...data,
      reference: referenceFor(submissionId),
      status: "new",
      currency: "USD",
      createdAt,
      requestHash: hash,
      notificationStatus: "pending",
      gsi1pk: "ORDER",
      gsi1sk: `${createdAt}#${submissionId}`,
    };
    try {
      await send("TransactWrite", {
        TransactItems: [
          { Put: { TableName: ordersTable, Item: item, ConditionExpression: "attribute_not_exists(id)" } },
          {
            Update: {
              TableName: limitsTable,
              Key: { id: rateKey },
              UpdateExpression: "SET expiresAt = :expiry ADD #count :one",
              ConditionExpression: "attribute_not_exists(#count) OR #count < :limit",
              ExpressionAttributeNames: { "#count": "count" },
              ExpressionAttributeValues: { ":expiry": Math.floor(t / 1000) + 7200, ":one": 1, ":limit": hourlyLimit },
            },
          },
        ],
      });
      return { duplicate: false };
    } catch (error) {
      /* A parallel retry may have saved the same submission first. */
      const after = compare(await existing(submissionId), hash);
      if (after) return after;
      if (error?.CancellationReasons?.[1]?.Code === "ConditionalCheckFailed") return { limited: true };
      throw error;
    }
  }

  async function setNotificationStatus(id, status) {
    await send("Update", {
      TableName: ordersTable,
      Key: { id },
      UpdateExpression: "SET notificationStatus = :status, notificationUpdatedAt = :at",
      ConditionExpression: "attribute_exists(id)",
      ExpressionAttributeValues: { ":status": status, ":at": new Date(now()).toISOString() },
    });
  }

  return { save, setNotificationStatus };
}
