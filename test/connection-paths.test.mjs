import assert from "node:assert/strict";
import test from "node:test";
import {
  connectionInvitationPath,
  connectionInvitationResponsePath,
  connectionInvitationsPath,
  connectionPath,
  connectionsPath,
} from "../src/connection-paths.js";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const INVITE_ID = "24dbc1d3-10c9-4421-b531-52189fd7509c";
const CONNECTION_ID = "33333333-3333-4333-8333-333333333333";

test("keeps the selected wardrobe on every connection request", () => {
  assert.equal(connectionsPath(TENANT_ID), `/api/users/connections?user=${TENANT_ID}`);
  assert.equal(connectionsPath(TENANT_ID, true), `/api/users/connections?include=outfit&user=${TENANT_ID}`);
  assert.equal(connectionInvitationsPath(TENANT_ID), `/api/users/connections/invitations?user=${TENANT_ID}`);
  assert.equal(
    connectionInvitationResponsePath(INVITE_ID, TENANT_ID),
    `/api/users/connections/invitations/${INVITE_ID}/respond?user=${TENANT_ID}`,
  );
  assert.equal(
    connectionInvitationPath(INVITE_ID, TENANT_ID),
    `/api/users/connections/invitations/${INVITE_ID}?user=${TENANT_ID}`,
  );
  assert.equal(
    connectionPath(CONNECTION_ID, TENANT_ID),
    `/api/users/connections/${CONNECTION_ID}?user=${TENANT_ID}`,
  );
});
