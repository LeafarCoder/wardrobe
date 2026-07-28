export const CONNECTION_PERMISSION_KEYS = Object.freeze(["referenceImages", "garments"]);

function cleanText(value, maxLength = 120) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function normalizeConnectionPermissions(value = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    referenceImages: Boolean(source.referenceImages),
    garments: Boolean(source.garments),
  };
}

export function hasConnectionPermission(value) {
  const permissions = normalizeConnectionPermissions(value);
  return permissions.referenceImages || permissions.garments;
}

export function normalizeConnectionInvites(value = []) {
  const seen = new Set();
  return (Array.isArray(value) ? value : []).flatMap((invite) => {
    if (!invite || typeof invite !== "object" || Array.isArray(invite)) return [];
    const id = cleanText(invite.id, 80);
    const requesterUserId = cleanText(invite.requesterUserId, 80);
    const recipientUserId = cleanText(invite.recipientUserId, 80);
    if (!id || !requesterUserId || !recipientUserId || requesterUserId === recipientUserId || seen.has(id)) return [];
    seen.add(id);
    const status = ["pending", "accepted", "declined", "cancelled", "revoked"].includes(invite.status)
      ? invite.status
      : "pending";
    return [{
      id,
      requesterUserId,
      recipientUserId,
      recipientEmail: cleanText(invite.recipientEmail, 254).toLowerCase(),
      relationship: cleanText(invite.relationship, 40) || "Connected person",
      requestedPermissions: normalizeConnectionPermissions(invite.requestedPermissions),
      status,
      createdAt: cleanText(invite.createdAt, 40) || null,
      respondedAt: cleanText(invite.respondedAt, 40) || null,
    }];
  }).slice(-1000);
}

export function normalizeAccountConnections(value = []) {
  const seen = new Set();
  return (Array.isArray(value) ? value : []).flatMap((connection) => {
    if (!connection || typeof connection !== "object" || Array.isArray(connection)) return [];
    const id = cleanText(connection.id, 80);
    const grantorUserId = cleanText(connection.grantorUserId, 80);
    const recipientUserId = cleanText(connection.recipientUserId, 80);
    if (!id || !grantorUserId || !recipientUserId || grantorUserId === recipientUserId || seen.has(id)) return [];
    const permissions = normalizeConnectionPermissions(connection.permissions);
    if (!hasConnectionPermission(permissions)) return [];
    seen.add(id);
    return [{
      id,
      inviteId: cleanText(connection.inviteId, 80) || null,
      grantorUserId,
      recipientUserId,
      relationship: cleanText(connection.relationship, 40) || "Connected person",
      permissions,
      createdAt: cleanText(connection.createdAt, 40) || null,
      updatedAt: cleanText(connection.updatedAt, 40) || null,
    }];
  }).slice(-1000);
}

export function connectionGrant(connections, grantorUserId, recipientUserId) {
  return normalizeAccountConnections(connections).find((connection) => (
    connection.grantorUserId === grantorUserId
    && connection.recipientUserId === recipientUserId
  )) || null;
}

export function connectionCanShare(connections, grantorUserId, recipientUserId, permission) {
  if (!CONNECTION_PERMISSION_KEYS.includes(permission)) return false;
  return Boolean(connectionGrant(connections, grantorUserId, recipientUserId)?.permissions?.[permission]);
}
