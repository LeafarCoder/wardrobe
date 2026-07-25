import assert from "node:assert/strict";
import test from "node:test";
import {
  createOAuthStateToken,
  createSessionToken,
  parseAllowedAccounts,
  pkceChallenge,
  readOAuthStateToken,
  sessionTokenUser,
} from "../scripts/import-job-api.mjs";

const SECRET = "a-long-server-side-session-secret-value";
const USER = "3f1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const DAY = 24 * 60 * 60 * 1000;

test("a session names the profile it belongs to", () => {
  assert.equal(sessionTokenUser(createSessionToken(SECRET, USER), SECRET), USER);
  assert.equal(sessionTokenUser(createSessionToken(SECRET, "default"), SECRET), "default");
});

test("a session signed with another secret is refused", () => {
  const token = createSessionToken(SECRET, USER);
  assert.equal(sessionTokenUser(token, "a-different-session-secret-value"), null);
});

test("a session cannot be re-pointed at another profile", () => {
  // Keep the signature, swap the subject: the classic privilege escalation.
  const [, timestamp, signature] = createSessionToken(SECRET, USER).split(".");
  const victim = Buffer.from("00000000-0000-4000-8000-000000000000").toString("base64url");
  assert.equal(sessionTokenUser(`${victim}.${timestamp}.${signature}`, SECRET), null);
});

test("a session expires and cannot be dated into the future", () => {
  assert.equal(sessionTokenUser(createSessionToken(SECRET, USER, Date.now() - (31 * DAY)), SECRET), null);
  assert.equal(sessionTokenUser(createSessionToken(SECRET, USER, Date.now() - (29 * DAY)), SECRET), USER);
  assert.equal(sessionTokenUser(createSessionToken(SECRET, USER, Date.now() + (5 * 60 * 1000)), SECRET), null);
});

test("a malformed session is refused rather than trusted", () => {
  for (const token of ["", "abc", "a.b", "a.b.c.d", null, undefined, 42]) {
    assert.equal(sessionTokenUser(token, SECRET), null);
  }
});

test("a session carrying a subject that is not a profile id is refused", () => {
  const subject = Buffer.from("../../etc/passwd").toString("base64url");
  const token = createSessionToken(SECRET, "../../etc/passwd");
  assert.equal(token.startsWith(`${subject}.`), true);
  assert.equal(sessionTokenUser(token, SECRET), null);
});

test("the login round trip survives a restart and rejects tampering", () => {
  const token = createOAuthStateToken(SECRET, { state: "abc", verifier: "xyz" });
  const restored = readOAuthStateToken(token, SECRET);

  assert.equal(restored.state, "abc");
  assert.equal(restored.verifier, "xyz");
  assert.equal(readOAuthStateToken(token, "another-secret"), null);
  assert.equal(readOAuthStateToken(`${token}x`, SECRET), null);
});

test("a stale login round trip is refused", () => {
  const stale = createOAuthStateToken(SECRET, { state: "abc", verifier: "xyz" }, Date.now() - (11 * 60 * 1000));
  assert.equal(readOAuthStateToken(stale, SECRET), null);
});

test("the PKCE challenge is the S256 digest of the verifier", () => {
  const challenge = pkceChallenge("verifier-value");
  assert.match(challenge, /^[A-Za-z0-9_-]+$/, "must be base64url with no padding");
  assert.equal(challenge, pkceChallenge("verifier-value"));
  assert.notEqual(challenge, pkceChallenge("another-verifier"));
});

test("the allowlist accepts plain addresses and addresses pinned to a profile", () => {
  const accounts = parseAllowedAccounts("Me@Example.com=default, partner@example.com\nthird@example.com=3f1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d");

  assert.equal(accounts.get("me@example.com"), "default");
  assert.equal(accounts.get("partner@example.com"), null);
  assert.equal(accounts.get("third@example.com"), "3f1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d");
  assert.equal(accounts.has("stranger@example.com"), false);
});

test("the allowlist ignores blanks and entries that are not addresses", () => {
  const accounts = parseAllowedAccounts(" , not-an-email, ,  spaced@example.com  ");

  assert.equal(accounts.size, 1);
  assert.equal(accounts.has("spaced@example.com"), true);
});

test("an empty allowlist grants nobody access", () => {
  assert.equal(parseAllowedAccounts("").size, 0);
  assert.equal(parseAllowedAccounts(undefined).size, 0);
});

test("a pinned profile id that is not a profile id is ignored rather than trusted", () => {
  const accounts = parseAllowedAccounts("me@example.com=../../etc/passwd");
  assert.equal(accounts.get("me@example.com"), null);
});
