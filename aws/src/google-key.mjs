/*
  The Google service account key, read once per Lambda container from AWS
  Secrets Manager (GOOGLE_KEY_SECRET is the secret's ARN). It lets the
  dashboard Lambda manage staff accounts in Firebase Authentication and the
  figures Lambda write daily figures to Firestore. It never reaches a browser.
*/
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

let key = null;

export async function googleKey() {
  if (!key) {
    const out = await new SecretsManagerClient({}).send(new GetSecretValueCommand({ SecretId: process.env.GOOGLE_KEY_SECRET }));
    key = JSON.parse(out.SecretString || "{}");
  }
  return key;
}
