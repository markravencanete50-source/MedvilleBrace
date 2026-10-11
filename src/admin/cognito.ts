/*
  Sign-in through Amazon Cognito, without an SDK.

  Cognito's user-pool API is a JSON POST with the operation named in a
  header, so a few fetch calls cover everything the dashboard needs: password
  sign-in, the first-sign-in password change, token refresh, sign-out and
  "forgot password". Cognito is in the AWS account that holds the BAA; the
  dashboard's only other network partner is the order API in the same account.

  Configuration is public, not secret: the app client has no secret, and every
  request the tokens unlock is checked again by API Gateway and the Lambda.
*/
import { ORDER_ENDPOINT } from "../data/site";

const env = import.meta.env ?? {};
export const COGNITO_REGION: string = env.VITE_COGNITO_REGION || "us-east-1";
export const COGNITO_CLIENT_ID: string = env.VITE_COGNITO_CLIENT_ID || "";
/* The dashboard API sits on the same API Gateway as the order form, at /admin. */
export const ADMIN_ENDPOINT: string = env.VITE_ADMIN_ENDPOINT || (ORDER_ENDPOINT ? ORDER_ENDPOINT.replace(/\/orders\/?$/, "/admin") : "");

export const isSignInConfigured = () => Boolean(COGNITO_CLIENT_ID);

export interface Tokens {
  idToken: string;
  accessToken: string;
  refreshToken: string;
  /* Milliseconds since the epoch at which the ID token stops working. */
  expiresAt: number;
}

export type SignInResult =
  | { kind: "signed-in"; tokens: Tokens }
  | { kind: "new-password"; session: string; username: string };

export class CognitoError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

/* Cognito's own messages can name the account; these never do. */
const PLAIN: Record<string, string> = {
  NotAuthorizedException: "That email address and password did not match.",
  UserNotFoundException: "That email address and password did not match.",
  PasswordResetRequiredException: "Your password has to be reset. Use Forgot password below.",
  UserNotConfirmedException: "This account is not active yet. Ask an owner to send the invitation again.",
  InvalidPasswordException: "Choose a password of at least 12 characters with an upper case letter, a lower case letter and a number.",
  CodeMismatchException: "That code is not right. Check the latest email and try again.",
  ExpiredCodeException: "That code has expired. Ask for a new one.",
  LimitExceededException: "Too many attempts. Wait a few minutes and try again.",
  TooManyRequestsException: "Too many attempts. Wait a few minutes and try again.",
  TooManyFailedAttemptsException: "Too many attempts. Wait a few minutes and try again.",
  InvalidParameterException: "Please check what you entered and try again.",
};

async function call<T>(operation: string, body: Record<string, unknown>): Promise<T> {
  if (!COGNITO_CLIENT_ID) throw new CognitoError("NotConfigured", "Sign-in is not connected yet. See README.md, Order dashboard.");
  let res: Response;
  try {
    res = await fetch(`https://cognito-idp.${COGNITO_REGION}.amazonaws.com/`, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
      headers: {
        "Content-Type": "application/x-amz-json-1.1",
        "X-Amz-Target": `AWSCognitoIdentityProviderService.${operation}`,
      },
      body: JSON.stringify({ ClientId: COGNITO_CLIENT_ID, ...body }),
    });
  } catch {
    throw new CognitoError("Network", "The sign-in service could not be reached. Check the connection and try again.");
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const code = String(data.__type ?? "").split("#").pop() || "Unknown";
    throw new CognitoError(code, PLAIN[code] ?? "Sign-in did not work. Please try again.");
  }
  return data as T;
}

interface AuthResponse {
  AuthenticationResult?: { IdToken: string; AccessToken: string; RefreshToken?: string; ExpiresIn: number };
  ChallengeName?: string;
  ChallengeParameters?: Record<string, string>;
  Session?: string;
}

function toTokens(r: NonNullable<AuthResponse["AuthenticationResult"]>, refreshToken?: string): Tokens {
  return {
    idToken: r.IdToken,
    accessToken: r.AccessToken,
    refreshToken: r.RefreshToken ?? refreshToken ?? "",
    expiresAt: Date.now() + r.ExpiresIn * 1000,
  };
}

function settle(r: AuthResponse, username: string): SignInResult {
  if (r.AuthenticationResult) return { kind: "signed-in", tokens: toTokens(r.AuthenticationResult) };
  if (r.ChallengeName === "NEW_PASSWORD_REQUIRED" && r.Session) {
    return { kind: "new-password", session: r.Session, username: r.ChallengeParameters?.USER_ID_FOR_SRP || username };
  }
  throw new CognitoError(r.ChallengeName ?? "Unknown", "This sign-in step is not supported here. Ask an owner for help.");
}

export async function passwordSignIn(email: string, password: string): Promise<SignInResult> {
  const username = email.trim().toLowerCase();
  const r = await call<AuthResponse>("InitiateAuth", { AuthFlow: "USER_PASSWORD_AUTH", AuthParameters: { USERNAME: username, PASSWORD: password } });
  return settle(r, username);
}

export async function setFirstPassword(session: string, username: string, password: string): Promise<SignInResult> {
  const r = await call<AuthResponse>("RespondToAuthChallenge", {
    ChallengeName: "NEW_PASSWORD_REQUIRED",
    Session: session,
    ChallengeResponses: { USERNAME: username, NEW_PASSWORD: password },
  });
  return settle(r, username);
}

export async function refresh(refreshToken: string): Promise<Tokens> {
  const r = await call<AuthResponse>("InitiateAuth", { AuthFlow: "REFRESH_TOKEN_AUTH", AuthParameters: { REFRESH_TOKEN: refreshToken } });
  if (!r.AuthenticationResult) throw new CognitoError("Refresh", "Please sign in again.");
  return toTokens(r.AuthenticationResult, refreshToken);
}

/* Ends the refresh token on the server, so a copied token cannot outlive the sign-out. */
export async function revoke(refreshToken: string) {
  await call("RevokeToken", { Token: refreshToken });
}

export async function requestReset(email: string) {
  await call("ForgotPassword", { Username: email.trim().toLowerCase() });
}

export async function confirmReset(email: string, code: string, password: string) {
  await call("ConfirmForgotPassword", { Username: email.trim().toLowerCase(), ConfirmationCode: code.trim(), Password: password });
}

/* Reads the claims of an ID token. Only for display: the server checks everything again. */
export function claims(idToken: string): Record<string, unknown> {
  try {
    const part = idToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), "="))
        .split("")
        .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`)
        .join(""),
    );
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
}
