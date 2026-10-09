/*
  "New order request" email to the store's inbox, sent through Resend.

  Deliberately says almost nothing: the reference and how many items. No
  name, address, email, product or note ever goes into an email, because
  products for a named person can reveal a health condition. The full
  request is read in the Firestore console of the protected Google Cloud
  project.
*/
export function notificationMessage(reference, itemCount) {
  const count = Number.isInteger(itemCount) ? itemCount : 0;
  return {
    subject: `New Medville Brace order request ${reference}`,
    text: `A new order request (${reference}, ${count} item${count === 1 ? "" : "s"}) is ready for review.\n\nOpen the orderRequests collection in the Firestore console to read it, then reply to the customer with the confirmed sizes and total.\n\nCustomer details are kept only in the protected database.`,
  };
}

export async function sendNotification({ reference, itemCount }, fetcher = fetch) {
  const { RESEND_API_KEY, NOTIFICATION_FROM, ORDER_NOTIFY_TO } = process.env;
  if (!RESEND_API_KEY || !NOTIFICATION_FROM || !ORDER_NOTIFY_TO) throw new Error("Notification not configured");
  const result = await fetcher("https://api.resend.com/emails", {
    method: "POST",
    signal: AbortSignal.timeout(10000),
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `order-${reference}`,
    },
    body: JSON.stringify({
      from: NOTIFICATION_FROM.includes("<") ? NOTIFICATION_FROM : `Medville Brace <${NOTIFICATION_FROM}>`,
      to: ORDER_NOTIFY_TO.split(",").map((s) => s.trim()),
      ...notificationMessage(reference, itemCount),
    }),
  });
  if (!result.ok) throw new Error("Notification delivery failed");
}
