import { useState } from "react";

// ============================================================
// ImportWalletModal
// ============================================================
// Shown once, right after signup — this is the one manual step that
// can't be automated: no website can programmatically add an account
// to MetaMask (that would be a serious security hole if it were
// possible). The user copies their private key here and pastes it into
// MetaMask's own "Import Account" screen, once. After that, MetaMask
// holds the key and every future transaction goes through MetaMask's
// real confirmation popup.
export default function ImportWalletModal({ walletAddress, privateKey, username, onDone }) {
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedAddr, setCopiedAddr] = useState(false);

  const copy = async (text, which) => {
    try {
      await navigator.clipboard.writeText(text);
      if (which === "key") {
        setCopiedKey(true);
        setTimeout(() => setCopiedKey(false), 2000);
      } else {
        setCopiedAddr(true);
        setTimeout(() => setCopiedAddr(false), 2000);
      }
    } catch {
      // clipboard API can fail without HTTPS/permissions — the text is
      // still visible below for manual copy.
    }
  };

  return (
    <div style={overlayStyle}>
      <div style={boxStyle}>
        <h3 style={{ marginTop: 0, color: "#6c2bd9" }}>Import Your Account Into MetaMask</h3>
        <p style={{ fontSize: "14px", color: "#aaa" }}>
          This is a one-time step. Your wallet was created and funded automatically, but MetaMask
          needs you to add it yourself — no website is allowed to do this for you (that's a MetaMask
          security rule, not a limitation of this app). After this, MetaMask will ask you to confirm
          every transaction you make.
        </p>

        <label style={labelStyle}>Wallet Address</label>
        <div style={fieldRow}>
          <code style={codeBoxStyle}>{walletAddress}</code>
          <button style={copyButtonStyle} onClick={() => copy(walletAddress, "addr")}>
            {copiedAddr ? "Copied!" : "Copy"}
          </button>
        </div>

        <label style={labelStyle}>Private Key</label>
        <div style={fieldRow}>
          <code style={codeBoxStyle}>{privateKey}</code>
          <button style={copyButtonStyle} onClick={() => copy(privateKey, "key")}>
            {copiedKey ? "Copied!" : "Copy"}
          </button>
        </div>
        <p style={{ fontSize: "12px", color: "#f59e0b" }}>
          This is only shown once. Copy it now — you can get it again later on the sign-in screen if
          needed (it will ask for your password again).
        </p>

        <div style={stepsBox}>
          <p style={{ fontWeight: "bold", marginBottom: "8px" }}>In MetaMask:</p>
          <ol style={{ paddingLeft: "20px", margin: 0, fontSize: "14px", lineHeight: "1.8" }}>
            <li>Open MetaMask → click the account icon (top right)</li>
            <li>Click <strong>"Add account or hardware wallet"</strong> → <strong>"Import account"</strong></li>
            <li>Paste the private key above, click <strong>Import</strong></li>
            <li>Make sure MetaMask's network is set to <strong>Localhost 8545</strong> (chain ID 31337)</li>
            {username && (
              <li>
                Rename this account to <strong>"{username}"</strong> in MetaMask (click the account
                name at the top → Edit / rename) — so it's easy to recognize next time you switch
                accounts.
              </li>
            )}
          </ol>
        </div>

        <button style={buttonStyle} onClick={onDone}>
          I've imported it — Continue
        </button>
      </div>
    </div>
  );
}

const overlayStyle = {
  position: "fixed",
  inset: 0,
  backgroundColor: "rgba(0,0,0,0.7)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 200,
  padding: "20px",
};

const boxStyle = {
  backgroundColor: "#161616",
  border: "1px solid #444",
  borderRadius: "12px",
  padding: "24px",
  maxWidth: "480px",
  width: "100%",
  maxHeight: "90vh",
  overflowY: "auto",
};

const labelStyle = { display: "block", marginTop: "14px", marginBottom: "6px", fontSize: "13px", color: "#aaa" };

const fieldRow = { display: "flex", gap: "8px", alignItems: "center" };

const codeBoxStyle = {
  flex: 1,
  display: "block",
  padding: "10px",
  borderRadius: "6px",
  backgroundColor: "#0d0d0d",
  border: "1px solid #333",
  fontSize: "12px",
  wordBreak: "break-all",
  color: "#c4b5fd",
};

const copyButtonStyle = {
  padding: "10px 12px",
  borderRadius: "6px",
  border: "1px solid #444",
  backgroundColor: "#2a2a2a",
  color: "white",
  cursor: "pointer",
  fontSize: "13px",
  whiteSpace: "nowrap",
};

const stepsBox = {
  marginTop: "16px",
  padding: "14px",
  borderRadius: "8px",
  backgroundColor: "#1a1a1a",
  border: "1px solid #333",
};

const buttonStyle = {
  width: "100%",
  marginTop: "18px",
  padding: "12px",
  borderRadius: "8px",
  border: "none",
  backgroundColor: "#6c2bd9",
  color: "white",
  fontSize: "16px",
  cursor: "pointer",
};
