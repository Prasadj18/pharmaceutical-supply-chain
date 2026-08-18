import { useState } from "react";
import { getContract } from "../contract";

export default function BatchHistory() {
  const [batchId, setBatchId] = useState("");
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchHistory = async () => {
    if (!batchId) return;
    setLoading(true);
    setEvents([]);
    try {
      const contract = await getContract();

      // Pull all past logs for this contract, then filter to this batch id
      const registeredFilter = contract.filters.BatchRegistered();
      const transferredFilter = contract.filters.OwnershipTransferred();

      const [registeredLogs, transferredLogs] = await Promise.all([
        contract.queryFilter(registeredFilter, 0, "latest"),
        contract.queryFilter(transferredFilter, 0, "latest"),
      ]);

      const relevant = [...registeredLogs, ...transferredLogs]
        .filter((log) => log.args.id.toString() === batchId.toString())
        .map((log) => ({
          type: log.eventName, // "BatchRegistered" or "OwnershipTransferred"
          owner: log.args.owner ?? log.args.newOwner,
          txHash: log.transactionHash,
          blockNumber: log.blockNumber,
        }));

      // Sort chronologically by block number so the story reads top-to-bottom
      relevant.sort((a, b) => a.blockNumber - b.blockNumber);

      setEvents(relevant);
    } catch (err) {
      console.error(err);
      alert("Failed to fetch history. Check the batch ID and try again.");
    } finally {
      setLoading(false);
    }
  };

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
        type="number"
        placeholder="Enter Batch ID"
        value={batchId}
        onChange={(e) => setBatchId(e.target.value)}
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
        disabled={loading}
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
        {loading ? "Loading..." : "View History"}
      </button>

      {events.length > 0 && (
        <ol style={{ marginTop: "20px", textAlign: "left", paddingLeft: "20px" }}>
          {events.map((e, i) => (
            <li key={i} style={{ marginBottom: "10px" }}>
              <strong>
                {e.type === "BatchRegistered" ? "Registered by" : "Transferred to"}
              </strong>
              : {e.owner}
              <br />
              <small>
                Block #{e.blockNumber} · Tx: {e.txHash.slice(0, 10)}...
              </small>
            </li>
          ))}
        </ol>
      )}

      {!loading && events.length === 0 && batchId && (
        <p style={{ marginTop: "15px", color: "#888" }}>
          No history found yet — try clicking "View History" after entering an ID.
        </p>
      )}
    </div>
  );
}