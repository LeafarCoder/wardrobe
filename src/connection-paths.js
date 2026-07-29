import { withWardrobeUser } from "./user-scope.js";

function encodedId(value) {
  return encodeURIComponent(String(value || ""));
}

export function connectionsPath(userId, includeOutfit = false) {
  return withWardrobeUser(
    `/api/users/connections${includeOutfit ? "?include=outfit" : ""}`,
    userId,
  );
}

export function connectionInvitationsPath(userId) {
  return withWardrobeUser("/api/users/connections/invitations", userId);
}

export function connectionInvitationPath(inviteId, userId) {
  return withWardrobeUser(
    `/api/users/connections/invitations/${encodedId(inviteId)}`,
    userId,
  );
}

export function connectionInvitationResponsePath(inviteId, userId) {
  return withWardrobeUser(
    `/api/users/connections/invitations/${encodedId(inviteId)}/respond`,
    userId,
  );
}

export function connectionPath(connectionId, userId) {
  return withWardrobeUser(
    `/api/users/connections/${encodedId(connectionId)}`,
    userId,
  );
}
