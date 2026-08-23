// frontend/src/components/BatchHistory.jsx
//
// The standalone "Fetch Batch" page: free-text batch code/ID input ->
// resolve to a numeric id -> render its full history. The actual
// fetching + rendering logic now lives in BatchTimeline.jsx (shared
// with the inline "click a batch row to see its history" views on the
// new sidebar dashboard) — this file just handles the code/ID -> id
// resolution and the input UI around it.
import { useState } from "react";
import { getReadOnlyContract } from "../contract";
import { useBatchTimeline } from "./batchTimelineData";
import { BatchTimelineEvents } from "./BatchTimeline";

export default function BatchHistory() {
  const [batchInput, setBatchInput] = useState("");
  const [resolvedId, setResolvedId] = useState(null);
  const [resolveError, setResolveError] = useState("");
  const [resolving, setResolving] = useState(false);

  const { loading, error, batchCodeLabel, batchMeta, events, resolved } = useBatchTimeline(resolvedId);

  const fetchHistory = async () => {
    if (!batchInput.trim()) return;
    setResolveError("");
    setResolvedId(null);
    setResolving(true);
    try {
      const contract = getReadOnlyContract();
      const trimmed = batchInput.trim();
      const id = /^\d+$/.test(trimmed) ? trimmed : await contract.getIdByCode(trimmed);
      if (id.toString() === "0") {
        throw new Error("That batch code / ID does not exist.");
      }
      setResolvedId(id.toString());
    } catch (err) {
      console.error(err);
      setResolveError(err.message || "Failed to fetch history. Check the batch code/ID and try again.");
    } finally {
      setResolving(false);
    }
  };

  const busy = loading || resolving;
  const shownError = resolveError || error;

  return (
    <div
      style={{
        border: "1px solid #ccc",
        padding: "20px",
        borderRadius: "10px",
        marginBottom: "30px",
      }}
    >
      <h2>Batch History</h2>

      <input
        type="text"
        placeholder="Batch Code (e.g. PARACETAMOL-001) or numeric ID"
        value={batchInput}
        onChange={(e) => setBatchInput(e.target.value)}
        style={{
          width: "100%",
          padding: "12px",
          marginBottom: "15px",
          borderRadius: "8px",
          border: "1px solid #ccc",
          fontSize: "16px",
          boxSizing: "border-box",
        }}
      />

      <button
        onClick={fetchHistory}
        disabled={busy}
        style={{
          width: "100%",
          padding: "12px",
          borderRadius: "8px",
          border: "none",
          backgroundColor: "#6c2bd9",
          color: "white",
          fontSize: "16px",
          cursor: "pointer",
        }}
      >
        {busy ? "Loading..." : "View History"}
      </button>

      {shownError && <p style={{ marginTop: "12px", color: "#fca5a5" }}>{shownError}</p>}

      {events.length > 0 && (
        <div style={{ marginTop: "20px" }}>
          <BatchTimelineEvents
            events={events}
            resolved={resolved}
            batchMeta={batchMeta}
            batchCodeLabel={batchCodeLabel}
          />
        </div>
      )}

      {!busy && events.length === 0 && !shownError && batchInput && (
        <p style={{ marginTop: "15px", color: "#888" }}>
          No history found yet — try clicking "View History" after entering a code or ID.
        </p>
      )}
    </div>
  );
}
