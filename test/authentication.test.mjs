import assert from "node:assert/strict";
import test from "node:test";
import {
  createSessionToken,
  passwordToken,
  validSessionToken,
} from "../scripts/import-job-api.mjs";

const PASSWORD = "a-long-shared-household-password";
const DAY = 24 * 60 * 60 * 1000;

test("accepts a freshly issued session token", () => {
  assert.equal(validSessionToken(createSessionToken(PASSWORD), PASSWORD), true);
});

test("rejects a session token issued for another password", () => {
  const token = createSessionToken(PASSWORD);
  assert.equal(validSessionToken(token, "a-different-household-password"), false);
});

test("rejects a session token older than thirty days", () => {
  const expired = createSessionToken(PASSWORD, Date.now() - (31 * DAY));
  assert.equal(validSessionToken(expired, PASSWORD), false);
});

test("accepts a session token close to the expiry boundary", () => {
  const almostExpired = createSessionToken(PASSWORD, Date.now() - (29 * DAY));
  assert.equal(validSessionToken(almostExpired, PASSWORD), true);
});

test("rejects a session token issued beyond the allowed clock skew", () => {
  const future = createSessionToken(PASSWORD, Date.now() + (5 * 60 * 1000));
  assert.equal(validSessionToken(future, PASSWORD), false);
});

test("tolerates a small forward clock difference", () => {
  const slightlyAhead = createSessionToken(PASSWORD, Date.now() + 30_000);
  assert.equal(validSessionToken(slightlyAhead, PASSWORD), true);
});

test("rejects a token whose signature was replaced", () => {
  const [timestamp] = createSessionToken(PASSWORD).split(".");
  assert.equal(validSessionToken(`${timestamp}.forged-signature`, PASSWORD), false);
});

test("rejects a token whose timestamp was moved forward under the original signature", () => {
  const [timestamp, signature] = createSessionToken(PASSWORD, Date.now() - DAY).split(".");
  const replayed = `${Number(timestamp) + DAY}.${signature}`;
  assert.equal(validSessionToken(replayed, PASSWORD), false);
});

test("rejects a token carrying extra dot-separated segments", () => {
  const token = createSessionToken(PASSWORD);
  assert.equal(validSessionToken(`${token}.extra`, PASSWORD), false);
});

test("rejects empty, malformed, and non-string tokens", () => {
  for (const token of ["", "not-a-token", ".", "abc.def", null, undefined, 42]) {
    assert.equal(validSessionToken(token, PASSWORD), false);
  }
});

test("password tokens are stable per password and differ between passwords", () => {
  assert.equal(passwordToken(PASSWORD), passwordToken(PASSWORD));
  assert.notEqual(passwordToken(PASSWORD), passwordToken(`${PASSWORD}!`));
});

test("password tokens are a fixed length so comparison cannot leak password length", () => {
  const short = passwordToken("short");
  const long = passwordToken("a-considerably-longer-household-password-value");
  assert.equal(short.length, long.length);
});
