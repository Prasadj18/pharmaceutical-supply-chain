// frontend/src/components/BatchTimeline.jsx
//
// Presentational pieces for a batch's full event history — the actual
// fetching lives in batchTimelineData.js's useBatchTimeline hook (split
// out into its own plain-JS module so this file only exports React
// components, which Vite's Fast Refresh requires for a clean dev
// experience).
//
// Used in two places:
//   1. BatchHistory.jsx — the standalone "Fetch Batch" page, where the
//      user types a batch code/ID and clicks a button.
//   2. Inline inside the sidebar dashboard's batch lists (Register
//      Batch, Ownership Transfer, My Batches) — clicking a batch row
//      shows its history right there via BatchTimelineView.

import { DELIVERY_STATUS_LABELS, useBatchTimeline } from "./batchTimelineData";
import { shortenAddress } from "../participants";

// Formats a Unix timestamp (seconds) into separate date/time strings.
function formatDateTime(unixSeconds) {
  const d = new Date(Number(unixSeconds) * 1000);
  const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  return { date, time };
}

// Date-only formatter for manufacture/expiry dates (no time component,
// since those are set by the manufacturer as calendar dates, not
// "the moment a transaction was mined" like the other timestamps).
function formatDateOnly(unixSeconds) {
  if (!unixSeconds || Number(unixSeconds) === 0) return "—";
  const d = new Date(Number(unixSeconds) * 1000);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// Resolves an address to a username/role via the backend directory.
function ParticipantLine({ address, resolved }) {
  const user = resolved[address?.toLowerCase()];
  return (
    <div>
      {user ? (
        <>
          <strong>{user.username}</strong>
          <br />
          <span style={{ color: "#a78bfa" }}>{user.role}</span>
          {user.city && <span style={{ color: "#888" }}> — {user.city}</span>}
        </>
      ) : (
        <strong>{shortenAddress(address)}</strong>
      )}
      <br />
      <small style={{ color: "#888" }}>{address}</small>
    </div>
  );
}

const eventLabels = {
  BatchRegistered: "BATCH REGISTERED",
  OwnershipTransferred: "OWNERSHIP TRANSFERRED",
  DeliveryStatusUpdated: "DELIVERY STATUS UPDATED",
  RatingSubmitted: "CONSUMER RATING",
};

/**
 * Pure presentational piece: meta summary line + the event timeline
 * cards. No fetching — feed it whatever useBatchTimeline() returned.
 */
export function BatchTimelineEvents({ events, resolved, batchMeta, batchCodeLabel, showTitle = true }) {
  return (
    <div style={{ textAlign: "left" }}>
      {showTitle && <h3 style={{ color: "#6c2bd9", marginBottom: "8px" }}>{batchCodeLabel}</h3>}

      {batchMeta && (
        <p style={{ fontSize: "13px", color: "#aaa", marginBottom: "16px" }}>
          Manufacture Date: {formatDateOnly(batchMeta.manufactureDate)} · Expiry Date:{" "}
          {formatDateOnly(batchMeta.expiryDate)} · Delivery Status:{" "}
          {DELIVERY_STATUS_LABELS[batchMeta.deliveryStatus]} · Rating:{" "}
          {batchMeta.ratingCount > 0
            ? `${batchMeta.averageRating.toFixed(1)} / 5 (${batchMeta.ratingCount})`
            : "No ratings yet"}
        </p>
      )}

      {events.map((e, i) => {
        const { date, time } = formatDateTime(e.timestamp);
        return (
          <div key={i}>
            <div
              style={{
                background: "#161616",
                border: "1px solid #333",
                borderRadius: "8px",
                padding: "14px",
                marginBottom: "10px",
              }}
            >
              <p style={{ margin: "0 0 8px 0", fontWeight: "bold", color: "#e5e5e5" }}>
                {i + 1}. {eventLabels[e.type] || e.type}
              </p>

              {e.type === "BatchRegistered" && <ParticipantLine address={e.to} resolved={resolved} />}

              {e.type === "OwnershipTransferred" && (
                <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
                  <div>
                    <small style={{ color: "#888" }}>From:</small>
                    <ParticipantLine address={e.from} resolved={resolved} />
                  </div>
                  <div>
                    <small style={{ color: "#888" }}>To:</small>
                    <ParticipantLine address={e.to} resolved={resolved} />
                  </div>
                </div>
              )}

              {e.type === "DeliveryStatusUpdated" && (
                <div>
                  <ParticipantLine address={e.to} resolved={resolved} />
                  <p style={{ marginTop: "6px" }}>
                    <strong style={{ color: e.status === 1 ? "#86efac" : "#fca5a5" }}>
                      {DELIVERY_STATUS_LABELS[e.status]}
                    </strong>
                  </p>
                </div>
              )}

              {e.type === "RatingSubmitted" && (
                <div>
                  <p style={{ margin: 0, color: "#f59e0b", fontSize: "18px" }}>
                    {"★".repeat(e.rating)}
                    {"☆".repeat(5 - e.rating)}{" "}
                    <span style={{ color: "#888", fontSize: "14px" }}>({e.rating}/5)</span>
                  </p>
                  <p style={{ margin: "6px 0 0 0", color: "#ccc" }}>
                    {e.name ? <strong>{e.name}</strong> : <span style={{ color: "#888" }}>Anonymous</span>}
                    {e.city && <span style={{ color: "#888" }}> — {e.city}</span>}
                  </p>
                  {e.feedback && (
                    <p style={{ margin: "8px 0 0 0", color: "#ddd", fontStyle: "italic" }}>"{e.feedback}"</p>
                  )}
                </div>
              )}

              <p style={{ marginTop: "10px", marginBottom: "2px" }}>
                <small style={{ color: "#888" }}>Date:</small> {date}{"  "}
                <small style={{ color: "#888" }}>Time:</small> {time}
              </p>
              <p style={{ margin: 0 }}>
                <small style={{ color: "#888" }}>
                  Block #{e.blockNumber} · Tx: {e.txHash.slice(0, 10)}...
                </small>
              </p>
            </div>
            {i < events.length - 1 && (
              <div style={{ textAlign: "center", color: "#6c2bd9", marginBottom: "10px" }}>↓</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * The common case: given a numeric batch id, load + render its full
 * history with built-in loading/error/empty states. Used inline inside
 * batch-list rows (click a batch, see its history right there).
 */
export default function BatchTimelineView({ batchId, showTitle = false }) {
  const { loading, error, batchCodeLabel, batchMeta, events, resolved } = useBatchTimeline(batchId);

  if (loading) return <p style={{ color: "#888", fontSize: "14px" }}>Loading history...</p>;
  if (error) return <p style={{ color: "#fca5a5", fontSize: "14px" }}>{error}</p>;
  if (events.length === 0) return null;

  return (
    <BatchTimelineEvents
      events={events}
      resolved={resolved}
      batchMeta={batchMeta}
      batchCodeLabel={batchCodeLabel}
      showTitle={showTitle}
    />
  );
}
