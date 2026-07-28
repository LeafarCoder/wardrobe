import { useMemo, useState } from "react";
import { Bell, Check, CoatHanger, Link, SpinnerGap, UserCircle, UsersThree, X } from "@phosphor-icons/react";
import { tr } from "./i18n.js";
import "./connections-dialog.css";

function PersonAvatar({ person }) {
  const source = person?.referenceImages?.[0]?.avatarUrl;
  return source
    ? <img className="connection-avatar" src={source} alt="" />
    : <span className="connection-avatar"><UserCircle size={25} /></span>;
}

function PermissionChoice({ value, available = { referenceImages: true, garments: true }, onChange }) {
  return (
    <div className="connection-permissions">
      {available.referenceImages && (
        <label>
          <input type="checkbox" checked={value.referenceImages} onChange={(event) => onChange({ ...value, referenceImages: event.target.checked })} />
          <span><UsersThree size={17} /><strong>{tr("Reference photos")}</strong><small>{tr("Appear together in generated Outfit Studio images")}</small></span>
        </label>
      )}
      {available.garments && (
        <label>
          <input type="checkbox" checked={value.garments} onChange={(event) => onChange({ ...value, garments: event.target.checked })} />
          <span><CoatHanger size={17} /><strong>{tr("Garments")}</strong><small>{tr("Browse and select these clothes in Outfit Studio")}</small></span>
        </label>
      )}
    </div>
  );
}

function PersonRow({ person, relationship, children }) {
  return (
    <article className="connection-person-row">
      <PersonAvatar person={person} />
      <div><strong>{person?.name || tr("Wardrobe account")}</strong><small>{relationship || person?.email || ""}</small></div>
      {children}
    </article>
  );
}

export function ConnectionsDialog({ data, busy, error, onClose, onInvite, onRespond, onCancelInvite, onUpdate, onDisconnect }) {
  const [email, setEmail] = useState("");
  const [relationship, setRelationship] = useState("Partner");
  const [requested, setRequested] = useState({ referenceImages: true, garments: true });
  const [confirmDisconnect, setConfirmDisconnect] = useState(null);
  const [confirmInvite, setConfirmInvite] = useState(null);
  const initialChoices = useMemo(() => Object.fromEntries((data.incomingInvites || []).map((invite) => [
    invite.id,
    { ...invite.requestedPermissions },
  ])), [data.incomingInvites]);
  const [choices, setChoices] = useState(initialChoices);

  const sendInvite = async (event) => {
    event.preventDefault();
    const sent = await onInvite({ email, relationship, permissions: requested });
    if (sent) setEmail("");
  };

  return (
    <div className="connections-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <section className="connections-dialog" role="dialog" aria-modal="true" aria-labelledby="connections-title">
        <header>
          <div><span><Link size={15} />{tr("Private connections")}</span><h2 id="connections-title">{tr("Connected people")}</h2><p>{tr("Invite another Wardrobe account. Nothing is shared until that person accepts and chooses the permissions.")}</p></div>
          <button type="button" onClick={onClose} disabled={Boolean(busy)} aria-label={tr("Close connections")}><X size={19} /></button>
        </header>

        <div className="connections-body">
          {!!data.incomingInvites?.length && (
            <section className="connections-section is-notification">
              <div className="connections-heading"><Bell size={17} /><div><span>{tr("Needs your response")}</span><h3>{tr("Connection invitations")}</h3></div></div>
              {data.incomingInvites.map((invite) => {
                const choice = choices[invite.id] || invite.requestedPermissions;
                return (
                  <div className="connection-invite" key={invite.id}>
                    <PersonRow person={invite.requester} relationship={tr("Describes you as: {relationship}", { relationship: invite.relationship })} />
                    <p>{tr("You recognize this person and choose exactly what this account may use. You can change or revoke access later.")}</p>
                    <PermissionChoice value={choice} available={invite.requestedPermissions} onChange={(value) => setChoices((current) => ({ ...current, [invite.id]: value }))} />
                    <div className="connection-actions">
                      <button type="button" onClick={() => onRespond(invite.id, "decline", choice)} disabled={Boolean(busy)}>{tr("Decline")}</button>
                      <button className="primary" type="button" onClick={() => onRespond(invite.id, "accept", choice)} disabled={Boolean(busy) || (!choice.referenceImages && !choice.garments)}>{busy === invite.id ? <SpinnerGap className="spin" /> : <Check />}{tr("Accept and share")}</button>
                    </div>
                  </div>
                );
              })}
            </section>
          )}

          <section className="connections-section">
            <div className="connections-heading"><UsersThree size={17} /><div><span>{tr("Your circle")}</span><h3>{tr("People sharing with you")}</h3></div></div>
            {data.grantedToMe?.length ? data.grantedToMe.map((connection) => (
              <PersonRow person={connection.person} relationship={connection.relationship} key={connection.id}>
                <div className="connection-tags">
                  {connection.permissions.referenceImages && <span>{tr("Reference photos")}</span>}
                  {connection.permissions.garments && <span>{tr("Garments")}</span>}
                </div>
                <button className={confirmDisconnect === connection.id ? "confirm" : ""} type="button" onClick={() => {
                  if (confirmDisconnect === connection.id) onDisconnect(connection.id);
                  else setConfirmDisconnect(connection.id);
                }} disabled={Boolean(busy)}>{tr(confirmDisconnect === connection.id ? "Confirm disconnect" : "Disconnect")}</button>
              </PersonRow>
            )) : <p className="connection-empty">{tr("No one is sharing with you yet.")}</p>}
          </section>

          <section className="connections-section">
            <div className="connections-heading"><Link size={17} /><div><span>{tr("Your sharing")}</span><h3>{tr("Access you have granted")}</h3></div></div>
            {data.sharedByMe?.length ? data.sharedByMe.map((connection) => (
              <div className="connection-shared" key={connection.id}>
                <PersonRow person={connection.person} relationship={connection.relationship} />
                <PermissionChoice value={connection.permissions} onChange={(permissions) => onUpdate(connection.id, permissions)} />
                <button className={`connection-revoke${confirmDisconnect === connection.id ? " confirm" : ""}`} type="button" onClick={() => {
                  if (confirmDisconnect === connection.id) onDisconnect(connection.id);
                  else setConfirmDisconnect(connection.id);
                }} disabled={Boolean(busy)}>{tr(confirmDisconnect === connection.id ? "Confirm revocation" : "Revoke all access")}</button>
              </div>
            )) : <p className="connection-empty">{tr("You are not sharing photos or garments with another account.")}</p>}
          </section>

          <section className="connections-section">
            <div className="connections-heading"><Link size={17} /><div><span>{tr("Invite in Wardrobe")}</span><h3>{tr("Request a connection")}</h3></div></div>
            <form className="connection-create" onSubmit={sendInvite}>
              <label><span>{tr("Their Google account email")}</span><input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@gmail.com" /></label>
              <label><span>{tr("Relationship")}</span><input required maxLength="40" value={relationship} onChange={(event) => setRelationship(event.target.value)} placeholder={tr("Partner, family, friend…")} /></label>
              <PermissionChoice value={requested} onChange={setRequested} />
              <button className="primary" type="submit" disabled={Boolean(busy) || !email.trim() || (!requested.referenceImages && !requested.garments)}>{busy === "invite" ? <SpinnerGap className="spin" /> : <Link />}{tr("Send in-app invitation")}</button>
            </form>
            {!!data.outgoingInvites?.length && <div className="connection-pending"><strong>{tr("Waiting for a response")}</strong>{data.outgoingInvites.map((invite) => <span key={invite.id}>{invite.recipient?.name || invite.recipient?.email} · {invite.relationship}<button className={confirmInvite === invite.id ? "confirm" : ""} type="button" onClick={() => {
              if (confirmInvite === invite.id) onCancelInvite(invite.id);
              else setConfirmInvite(invite.id);
            }}>{tr(confirmInvite === invite.id ? "Confirm cancellation" : "Cancel invitation")}</button></span>)}</div>}
          </section>
          <p className="connection-privacy-note">{tr("Revoking access blocks future use immediately and removes saved generated Outfit Studio images involving that connection. Original photos and garments always remain in their owner's wardrobe.")}</p>
          {error && <p className="connections-error" role="alert">{error}</p>}
        </div>
      </section>
    </div>
  );
}
