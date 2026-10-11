/*
  "New order request" email to the store's inbox, sent through Amazon SES.

  Deliberately says almost nothing: the reference and how many items. No
  name, address, email, product or note ever goes into an email, because
  products for a named person can reveal a health condition. The full request
  is read in the DynamoDB console of the AWS account that holds the BAA.
*/
export function notificationMessage(reference, itemCount) {
  const count = Number.isInteger(itemCount) ? itemCount : 0;
  return {
    subject: `New Medville Brace order request ${reference}`,
    text: `A new order request (${reference}, ${count} item${count === 1 ? "" : "s"}) is ready for review.\n\nOpen the medville-brace-orders table in the DynamoDB console to read it, then reply to the customer with the confirmed sizes and total.\n\nCustomer details are kept only in the protected database.`,
  };
}

/*
  send(input) is the SES SendEmail call, passed in so tests need no AWS SDK.
  Resolves to "sent", or "not-configured" when no sender or inbox is set.
*/
export async function sendNotification({ reference, itemCount }, send, env = process.env) {
  const from = env.SENDER_EMAIL || "";
  const to = (env.NOTIFY_TO || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!from || !to.length) return "not-configured";
  const message = notificationMessage(reference, itemCount);
  await send({
    FromEmailAddress: `Medville Brace <${from}>`,
    Destination: { ToAddresses: to },
    Content: {
      Simple: {
        Subject: { Data: message.subject, Charset: "UTF-8" },
        Body: { Text: { Data: message.text, Charset: "UTF-8" } },
      },
    },
  });
  return "sent";
}
