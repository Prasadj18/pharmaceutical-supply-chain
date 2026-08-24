import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
// BatchCodeInput
export default function BatchCodeInput({ value, onChange, placeholder, style, onKeyDown }) {
  const [scanning, setScanning] = useState(false);
  const [fileScanning, setFileScanning] = useState(false);
  const [fileError, setFileError] = useState("");
  const fileInputRef = useRef(null);

  const handleFileChosen = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // lets picking the exact same file again re-trigger onChange
    if (!file) return;

    setFileError("");
    setFileScanning(true);
    const scanner = new Html5Qrcode("qr-file-scan-region");
    try {
      const decodedText = await scanner.scanFile(file, false);
      onChange(decodedText);
    } catch (err) {
      console.error(err);
      setFileError("Could not find a QR code in that image. Try a clearer photo, or type the batch code instead.");
    } finally {
      setFileScanning(false);
      scanner.clear().catch(() => {});
    }
  };

  return (
    <div style={{ marginBottom: style?.marginBottom ?? "15px" }}>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder={placeholder || "Batch Code (e.g. PARACETAMOL-001) or numeric ID"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          style={{ ...style, flex: 1, minWidth: "140px", marginBottom: 0 }}
        />
        <button type="button" style={scanButtonStyle} onClick={() => setScanning(true)}>
           Scan
        </button>
        <button type="button" style={scanButtonStyle} onClick={() => fileInputRef.current?.click()} disabled={fileScanning}>
          {fileScanning ? "Reading..." : " Upload"}
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChosen} style={{ display: "none" }} />
      </div>

      {/* html5-qrcode needs a real element to attach to even for file
          scanning (it never shows a camera feed here) — kept hidden and
          always mounted so a fresh Html5Qrcode instance always has
          something to find. */}
      <div id="qr-file-scan-region" style={{ display: "none" }} />

      {fileError && <p style={{ color: "#fca5a5", fontSize: "12px", marginTop: "6px" }}>{fileError}</p>}

      {scanning && (
        <QRScannerModal
          onDetected={(text) => {
            onChange(text);
            setScanning(false);
          }}
          onClose={() => setScanning(false)}
        />
      )}
    </div>
  );
}

function QRScannerModal({ onDetected, onClose }) {
  const containerId = "qr-scanner-region";
  const scannerRef = useRef(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const scanner = new Html5Qrcode(containerId);
    scannerRef.current = scanner;
    let stopped = false;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => {
          if (stopped) return;
          stopped = true;
          scanner
            .stop()
            .then(() => scanner.clear())
            .catch(() => {})
            .finally(() => onDetected(decodedText));
        },
        // per-frame "nothing found yet" callback — intentionally ignored,
        // it fires continuously while scanning and isn't an error.
        () => {}
      )
      .catch((err) => {
        setError(
          "Could not access the camera. Check your browser's camera permission for this site, or type the batch code instead."
        );
        console.error(err);
      });

    return () => {
      if (!stopped) {
        scanner
          .stop()
          .then(() => scanner.clear())
          .catch(() => {});
      }
    };
  }, [onDetected]);

  return (
    <div style={overlayStyle}>
      <div style={boxStyle}>
        <h3 style={{ marginTop: 0, color: "#6c2bd9" }}>Scan QR Code</h3>
        <div id={containerId} style={{ width: "260px", margin: "0 auto" }} />
        {error && <p style={{ color: "#fca5a5", fontSize: "13px", marginTop: "10px" }}>{error}</p>}
        <button style={cancelButtonStyle} onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}

const scanButtonStyle = {
  padding: "0 14px",
  borderRadius: "8px",
  border: "1px solid #444",
  backgroundColor: "#1a1a1a",
  color: "#ccc",
  fontSize: "14px",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

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
  maxWidth: "340px",
  width: "100%",
  textAlign: "center",
};

const cancelButtonStyle = {
  width: "100%",
  marginTop: "16px",
  padding: "12px",
  borderRadius: "8px",
  border: "none",
  backgroundColor: "#333",
  color: "white",
  fontSize: "16px",
  cursor: "pointer",
};