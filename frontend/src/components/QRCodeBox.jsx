import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { uploadQRCodeToIPFS, getQRCodeFromIPFS } from "../api";
// QRCodeBox
export default function QRCodeBox({ batchCode, compact = false }) {
  const [dataUrl, setDataUrl] = useState(null);
  const [error, setError] = useState("");
  const [ipfsRecord, setIpfsRecord] = useState(null); // { cid, url } once saved (or previously saved)
  const [ipfsLoading, setIpfsLoading] = useState(false);
  const [ipfsMessage, setIpfsMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    setDataUrl(null);
    setError("");
    if (!batchCode) return;

    QRCode.toDataURL(batchCode, { width: compact ? 120 : 220, margin: 1 })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Could not generate QR code.");
      });

    // Check if this batch already has a QR saved to IPFS from before.
    getQRCodeFromIPFS(batchCode).then((record) => {
      if (!cancelled && record) setIpfsRecord(record);
    });
    return () => {
      cancelled = true;
    };
  }, [batchCode, compact]);

  const handleDownload = () => {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${batchCode}-qrcode.png`;
    a.click();
  };

  const handleSaveToIPFS = async () => {
    if (!dataUrl) return;
    setIpfsLoading(true);
    setIpfsMessage("");
    try {
      const result = await uploadQRCodeToIPFS(batchCode, dataUrl);
      setIpfsRecord(result);
      setIpfsMessage("Saved to IPFS.");
    } catch (err) {
      setIpfsMessage(err.message);
    } finally {
      setIpfsLoading(false);
    }
  };

  if (!batchCode) return null;

  return (
    <div style={{ textAlign: "center" }}>
      {dataUrl && (
        <img
          src={dataUrl}
          alt={`QR code for ${batchCode}`}
          width={compact ? 120 : 220}
          height={compact ? 120 : 220}
          style={{ borderRadius: "8px", background: "#fff", padding: "8px", display: "inline-block" }}
        />
      )}
      {!dataUrl && !error && (
        <div
          style={{
            width: compact ? 120 : 220,
            height: compact ? 120 : 220,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "8px",
            background: "#fff",
            color: "#666",
            fontSize: "12px",
          }}
        >
          Generating...
        </div>
      )}
      {error && <p style={{ fontSize: "12px", color: "#fca5a5" }}>{error}</p>}
      <div style={{ display: "flex", gap: "8px", justifyContent: "center", marginTop: "10px", flexWrap: "wrap" }}>
        <button style={qrButtonStyle} onClick={handleDownload} disabled={!dataUrl}>
          Download QR Code
        </button>
        {!ipfsRecord && (
          <button style={{ ...qrButtonStyle, backgroundColor: "#333" }} onClick={handleSaveToIPFS} disabled={ipfsLoading || !dataUrl}>
            {ipfsLoading ? "Saving..." : "Save to IPFS"}
          </button>
        )}
      </div>
      {ipfsRecord && (
        <p style={{ fontSize: "12px", color: "#86efac", marginTop: "8px", wordBreak: "break-all" }}>
          On IPFS:{" "}
          <a href={ipfsRecord.url} target="_blank" rel="noreferrer" style={{ color: "#a78bfa" }}>
            {ipfsRecord.cid}
          </a>
        </p>
      )}
      {ipfsMessage && <p style={{ fontSize: "12px", color: "#f59e0b", marginTop: "6px" }}>{ipfsMessage}</p>}
    </div>
  );
}

const qrButtonStyle = {
  padding: "10px 14px",
  borderRadius: "8px",
  border: "none",
  backgroundColor: "#6c2bd9",
  color: "white",
  fontSize: "13px",
  cursor: "pointer",
};