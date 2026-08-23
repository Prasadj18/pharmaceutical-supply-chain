// ============================================================
// ConfirmAndSign
// ============================================================
// CHANGED: this used to ask the user to re-enter their password as a
// stand-in "confirmation" step, because at that point transactions were
// signed silently in memory with no real approval UI at all.
//
// Now that writes go through MetaMask (see contract.js
// getMetaMaskContract), MetaMask itself pops up its own "Confirm"
// screen before any transaction is sent — that popup IS the real
// security boundary. This component is now just a friendly review
// screen: it shows what's about to happen and hands off to MetaMask
// when the user clicks Continue. No password field needed here anymore.
export default function ConfirmAndSign({ summary, onConfirmed, onCancel }) {
  return (
    <div style={overlayStyle}>
      <div style={boxStyle}>
        <h3 style={{ marginTop: 0, color: "#6c2bd9" }}>Review Transaction</h3>
        <div style={summaryStyle}>{summary}</div>
        <p style={{ fontSize: "13px", color: "#888" }}>
          MetaMask will open next and ask you to confirm this transaction. Nothing is sent to the
          blockchain until you approve it there.
        </p>

        <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
          <button style={{ ...buttonStyle, backgroundColor: "#333" }} onClick={onCancel}>
            Cancel
          </button>
          <button style={buttonStyle} onClick={onConfirmed}>
            Continue to MetaMask
          </button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle = {
  position: "fixed",
  inset: 0,
  backgroundColor: "rgba(0,0,0,0.6)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 100,
};

const boxStyle = {
  backgroundColor: "#161616",
  border: "1px solid #444",
  borderRadius: "12px",
  padding: "24px",
  maxWidth: "420px",
  width: "90%",
};

const summaryStyle = {
  backgroundColor: "#1a1a1a",
  border: "1px solid #333",
  borderRadius: "8px",
  padding: "12px",
  marginBottom: "16px",
  fontSize: "14px",
  textAlign: "left",
};

const buttonStyle = {
  flex: 1,
  padding: "12px",
  borderRadius: "8px",
  border: "none",
  backgroundColor: "#6c2bd9",
  color: "white",
  fontSize: "16px",
  cursor: "pointer",
};
