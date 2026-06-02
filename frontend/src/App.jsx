import { useState } from "react";
import { getContract } from "./contract";

function App() {
  const [productName, setProductName] = useState("");
  const [quantity, setQuantity] = useState("");

  const [batchId, setBatchId] = useState("");
  const [batch, setBatch] = useState(null);

  const [transferId, setTransferId] = useState("");
  const [newOwner, setNewOwner] = useState("");

  const [loading, setLoading] = useState(false);

  // Register Batch
  const registerBatch = async () => {
    try {
      setLoading(true);

      const contract = await getContract();

      const tx = await contract.registerBatch(
        productName,
        quantity
      );

      await tx.wait();

      alert("Batch Registered Successfully!");

      setProductName("");
      setQuantity("");
    } catch (err) {
      console.error(err);
      alert("Registration Failed");
    } finally {
      setLoading(false);
    }
  };

  // Fetch Batch
  const fetchBatch = async () => {
    try {
      const contract = await getContract();

      const data = await contract.getBatch(batchId);

      setBatch({
        id: data.id.toString(),
        productName: data.productName,
        manufacturer: data.manufacturer,
        quantity: data.quantity.toString(),
        currentOwner: data.currentOwner,
      });
    } catch (err) {
      console.error(err);
      alert("Failed to fetch batch");
    }
  };

  // Transfer Ownership
  const transferOwnership = async () => {
    try {
      setLoading(true);

      const contract = await getContract();

      const tx = await contract.transferOwnership(
        transferId,
        newOwner
      );

      await tx.wait();

      alert("Ownership Transferred Successfully!");

      setTransferId("");
      setNewOwner("");
    } catch (err) {
      console.error(err);
      alert("Transfer Failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        padding: "40px",
        maxWidth: "700px",
        margin: "auto",
        fontFamily: "Arial",
      }}
    >
      <h1
  style={{
    fontSize: "32px",
    marginBottom: "30px",
    color: "#6c2bd9",
  }}
>
  Pharmaceutical Supply Chain App </h1>

      {/* Register Batch */}
      <div
        style={{
          border: "1px solid #ccc",
          padding: "20px",
          borderRadius: "10px",
          marginBottom: "30px",
        }}
      >
        <h2>Register Batch</h2>

        <input
          type="text"
          placeholder="Product Name"
          value={productName}
          onChange={(e) => setProductName(e.target.value)}
          style={inputStyle}
        />

        <input
          type="number"
          placeholder="Quantity"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          style={inputStyle}
        />

        <button
          onClick={registerBatch}
          disabled={loading}
          style={buttonStyle}
        >
          {loading ? "Processing..." : "Register Batch"}
        </button>
      </div>

      {/* Fetch Batch */}
      <div
        style={{
          border: "1px solid #ccc",
          padding: "20px",
          borderRadius: "10px",
          marginBottom: "30px",
        }}
      >
        <h2>Fetch Batch Details</h2>

        <input
          type="number"
          placeholder="Enter Batch ID"
          value={batchId}
          onChange={(e) => setBatchId(e.target.value)}
          style={inputStyle}
        />

        <button onClick={fetchBatch} style={buttonStyle}>
          Fetch Batch
        </button>

        {batch && (
          <div
            style={{
              marginTop: "20px",
              textAlign: "left",
              background: "#f4f4f4",
              padding: "15px",
              borderRadius: "10px",
            }}
          >
            <p>
              <strong>ID:</strong> {batch.id}
            </p>

            <p>
              <strong>Product Name:</strong> {batch.productName}
            </p>

            <p>
              <strong>Quantity:</strong> {batch.quantity}
            </p>

            <p>
              <strong>Manufacturer:</strong> {batch.manufacturer}
            </p>

            <p>
              <strong>Current Owner:</strong> {batch.currentOwner}
            </p>
          </div>
        )}
      </div>

      {/* Transfer Ownership */}
      <div
        style={{
          border: "1px solid #ccc",
          padding: "20px",
          borderRadius: "10px",
        }}
      >
        <h2>Transfer Ownership</h2>

        <input
          type="number"
          placeholder="Batch ID"
          value={transferId}
          onChange={(e) => setTransferId(e.target.value)}
          style={inputStyle}
        />

        <input
          type="text"
          placeholder="New Owner Address"
          value={newOwner}
          onChange={(e) => setNewOwner(e.target.value)}
          style={inputStyle}
        />

        <button
          onClick={transferOwnership}
          disabled={loading}
          style={buttonStyle}
        >
          {loading ? "Processing..." : "Transfer Ownership"}
        </button>
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  padding: "12px",
  marginBottom: "15px",
  borderRadius: "8px",
  border: "1px solid #ccc",
  fontSize: "16px",
  boxSizing: "border-box",
};

const buttonStyle = {
  width: "100%",
  padding: "12px",
  borderRadius: "8px",
  border: "none",
  backgroundColor: "#6c2bd9",
  color: "white",
  fontSize: "16px",
  cursor: "pointer",
};

export default App;