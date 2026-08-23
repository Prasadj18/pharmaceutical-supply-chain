import { useState } from "react";
import { ethers } from "ethers";
import { getContract } from "./contract";

function App() {

  // =========================================================
  // WALLET / ROLE
  // =========================================================

  const [walletAddress, setWalletAddress] = useState("");
  const [role, setRole] = useState("");
  const [connected, setConnected] = useState(false);


  // =========================================================
  // REGISTER BATCH
  // =========================================================

  const [productName, setProductName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [manufactureDate, setManufactureDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");

  // =========================================================
  // FETCH BATCH
  // =========================================================

  const [batchId, setBatchId] = useState("");
  const [batch, setBatch] = useState(null);
  const [ownershipHistory, setOwnershipHistory] = useState([]);
  const [historyRoles, setHistoryRoles] = useState([]);

  // =========================================================
  // TRANSFER
  // =========================================================

  const [transferId, setTransferId] = useState("");
  const [newOwner, setNewOwner] = useState("");
  const [statusBatchId, setStatusBatchId] = useState("");

  const [loading, setLoading] = useState(false);


  // =========================================================
  // CONNECT WALLET
  // =========================================================

  const connectWallet = async () => {

    try {

      const contract = await getContract();

      if (!contract) {
        return;
      }

      const signer =
        await contract.runner.getAddress();

      setWalletAddress(signer);
      setConnected(true);


      // Get role from smart contract

      const roleValue =
        await contract.roles(signer);


      const roleNumber =
        Number(roleValue);


      const roleNames = {

        0: "NONE",
        1: "ADMIN",
        2: "MANUFACTURER",
        3: "TRANSPORTER",
        4: "DISTRIBUTOR",
        5: "PHARMACY",

      };


      setRole(
        roleNames[roleNumber] || "UNKNOWN"
      );

    } catch (err) {

      console.error(err);

      alert(
        "Failed to connect wallet"
      );
    }
  };


  // =========================================================
  // REGISTER BATCH
  // =========================================================

  const registerBatch = async () => {

    try {

      setLoading(true);

      const contract =
        await getContract();

      if (!contract) {
        setLoading(false);
        return;
      }


      if (!productName.trim()) {

        alert(
          "Please enter product name"
        );

        return;
      }


      if (
        !quantity ||
        Number(quantity) <= 0
      ) {

        alert(
          "Quantity must be greater than zero"
        );

        return;
      }


      if (!manufactureDate) {

        alert(
          "Please select manufacturing date"
        );

        return;
      }


      if (!expiryDate) {

        alert(
          "Please select expiry date"
        );

        return;
      }


      const manufactureTimestamp =
        Math.floor(
      new Date(`${manufactureDate}T00:00:00`).getTime() / 1000
        );

      const expiryTimestamp =
      Math.floor(
      new Date(`${expiryDate}T00:00:00`).getTime() / 1000
      );
      if (
        !Number.isFinite(manufactureTimestamp) ||
        !Number.isFinite(expiryTimestamp)
      ) {
          alert("Invalid date selected");
        return;
}

      if (
        expiryTimestamp <=
        manufactureTimestamp
      ) {

        alert(
          "Expiry date must be after manufacturing date"
        );

        return;
      }


      const tx =
        await contract.registerBatch(

          productName,

          quantity,

          manufactureTimestamp,

          expiryTimestamp

        );


      await tx.wait();


      alert(
        "Batch Registered Successfully!"
      );


      setProductName("");
      setQuantity("");
      setManufactureDate("");
      setExpiryDate("");


    } catch (err) {

      console.error(err);

      alert(
        "Registration Failed. Check your role and MetaMask."
      );

    } finally {

      setLoading(false);
    }
  };


  // =========================================================
  // FETCH BATCH
  // =========================================================

  const fetchBatch = async () => {

    try {

      const contract =
        await getContract();

      if (!contract) {
        return;
      }


      const data =
        await contract.getBatch(
          batchId
        );

      const history =
        await contract.getOwnershipHistory(batchId);

      const historyWithRoles = await Promise.all(
        history.map(async (record) => {

          const roleValue =
            await contract.getRole(record.owner);

          return {
            owner: record.owner,
            timestamp: Number(record.timestamp),
            role: Number(roleValue),
          };

        })
      );

setOwnershipHistory(historyWithRoles);


      setBatch({

        id:
          data.id.toString(),

        productName:
          data.productName,

        quantity:
          data.quantity.toString(),

        manufactureDate:
          new Date(
            Number(
              data.manufactureDate
            ) * 1000
          ).toLocaleDateString(),

        expiryDate:
          new Date(
            Number(
              data.expiryDate
            ) * 1000
          ).toLocaleDateString(),

        manufacturer:
          data.manufacturer,

        currentOwner:
          data.currentOwner,

        status:
          data.status.toString(),

        exists:
          data.exists,

      });

    } catch (err) {

      console.error(err);

      alert(
        "Failed to fetch batch"
      );
    }
  };


  // =========================================================
  // TRANSFER OWNERSHIP
  // =========================================================

  const transferOwnership = async () => {

  try {

    setLoading(true);

    const contract =
      await getContract();

    if (!contract) {
      setLoading(false);
      return;
    }


    if (!transferId) {

      alert(
        "Please enter Batch ID"
      );

      return;
    }


    let nextOwner;


    // Manufacturer → Transporter

    if (isManufacturer) {

      nextOwner =
        "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";

    }


    // Transporter → Distributor

    else if (isTransporter) {

      nextOwner =
        "0x90F79bf6EB2c4f870365E785982E1f101E93b906";

    }


    // Distributor → Pharmacy

    else if (isDistributor) {

      nextOwner =
        "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65";

    }


    else {

      alert(
        "Your role is not authorized to transfer ownership."
      );

      return;
    }


    const tx =
      await contract.transferOwnership(
        transferId,
        nextOwner
      );


    await tx.wait();


    alert(
      "Ownership Transferred Successfully!"
    );


    setTransferId("");


  } catch (err) {

    console.error(err);

    alert(
      "Transfer Failed. Make sure you are the current owner."
    );

  } finally {

    setLoading(false);

  }
};


  // =========================================================
  // PHARMACY STATUS UPDATES
  // =========================================================

  const markAtPharmacy = async () => {

    try {

      setLoading(true);

      const contract = await getContract();

      if (!contract) {
        setLoading(false);
        return;
      }

      const tx =
        await contract.updateBatchStatus(
          statusBatchId,
          3
        );

      await tx.wait();

      alert("Batch marked AT_PHARMACY successfully!");

      setStatusBatchId("");

    } catch (err) {

      console.error(err);

      alert("Failed to update status");

    } finally {

      setLoading(false);

    }
  };

  const markDelivered = async () => {

    try {

      setLoading(true);

      const contract = await getContract();

      if (!contract) {
        setLoading(false);
        return;
      }

      const tx =
        await contract.updateBatchStatus(
          statusBatchId,
          4
        );

      await tx.wait();

      alert("Batch marked DELIVERED successfully!");

      setStatusBatchId("");

    } catch (err) {

      console.error(err);

      alert("Failed to update status");

    } finally {

      setLoading(false);

    }
  };

  const statusSteps = [
  {
    id: 0,
    label: "MANUFACTURED",
    icon: "🏭",
  },
  {
    id: 1,
    label: "IN TRANSIT",
    icon: "🚚",
  },
  {
    id: 2,
    label: "AT DISTRIBUTOR",
    icon: "📦",
  },
  {
    id: 3,
    label: "AT PHARMACY",
    icon: "💊",
  },
  {
    id: 4,
    label: "DELIVERED",
    icon: "✅",
  },
];
// =========================================================
// STATUS NAME
// =========================================================

const isManufacturer = role === "MANUFACTURER";
const isTransporter = role === "TRANSPORTER";
const isDistributor = role === "DISTRIBUTOR";
const isPharmacy = role === "PHARMACY";


const getStatusName = (status) => {

  const statuses = {

    0: "MANUFACTURED",
    1: "IN_TRANSIT",
    2: "AT_DISTRIBUTOR",
    3: "AT_PHARMACY",
    4: "DELIVERED",
    5: "REJECTED",
    6: "EXPIRED",

  };

  return (
    statuses[status] ||
    "UNKNOWN"
  );
};


// =========================================================
// OWNER ROLE
// =========================================================
const getOwnerRole = (roleValue) => {

  const roles = {
    1: "👑 Admin",
    2: "🏭 Manufacturer",
    3: "🚚 Transporter",
    4: "📦 Distributor",
    5: "💊 Pharmacy",
  };

  return roles[roleValue] || "Unknown Stakeholder";
};

  // =========================================================
  // UI
  // =========================================================

  return (

    <div
      style={{
        padding: "40px",
        maxWidth: "800px",
        margin: "auto",
        fontFamily: "Arial",
      }}
    >

      <h1
        style={{
          fontSize: "32px",
          marginBottom: "10px",
          color: "#e7ff91",
        }}
      >
        Pharmaceutical Supply Chain
      </h1>


      <p
        style={{
          marginBottom: "30px",
          color: "#666",
        }}
      >
        Blockchain-based medicine tracking system
      </p>


      {/* =====================================================
          WALLET
      ===================================================== */}

      <div
        style={{
          border: "1px solid #ccc",
          padding: "20px",
          borderRadius: "10px",
          marginBottom: "30px",
        }}
      >

        <h2>
          Blockchain Wallet
        </h2>


        {!connected ? (

          <button
            onClick={connectWallet}
            style={buttonStyle}
          >
            Connect MetaMask
          </button>

        ) : (

          <div>

            <p>
              <strong>
                Wallet:
              </strong>
              <br />
              {walletAddress}
            </p>


            <p>
              <strong>
                Role:
              </strong>{" "}
              {role}
            </p>


            <p
              style={{
                color: "green",
                fontWeight: "bold",
              }}
            >
              ✅ Smart Contract Connected
            </p>

          </div>

        )}

      </div>


      {/* =====================================================
          REGISTER BATCH
      ===================================================== */}

      {isManufacturer && (
        <div
          style={cardStyle}
        >
        <h2>
          Register Medicine Batch
        </h2>


        <input
          type="text"
          placeholder="Product Name"
          value={productName}
          onChange={(e) =>
            setProductName(
              e.target.value
            )
          }
          style={inputStyle}
        />


        <input
          type="number"
          placeholder="Quantity"
          value={quantity}
          onChange={(e) =>
            setQuantity(
              e.target.value
            )
          }
          style={inputStyle}
        />


        <label>
          Manufacturing Date
        </label>

        <input
          type="date"
          value={manufactureDate}
          onChange={(e) =>
            setManufactureDate(
              e.target.value
            )
          }
          style={inputStyle}
        />


        <label>
          Expiry Date
        </label>

        <input
          type="date"
          value={expiryDate}
          onChange={(e) =>
            setExpiryDate(
              e.target.value
            )
          }
          style={inputStyle}
        />


        <button
          onClick={registerBatch}
          disabled={loading}
          style={buttonStyle}
        >

          {loading
            ? "Processing..."
            : "Register Batch"}

        </button>

        </div>
      )}


      {/* =====================================================
          FETCH BATCH
      ===================================================== */}

      <div
        style={cardStyle}
      >

        <h2>
          Track Medicine Batch
        </h2>


        <input
          type="number"
          placeholder="Enter Batch ID"
          value={batchId}
          onChange={(e) =>
            setBatchId(
              e.target.value
            )
          }
          style={inputStyle}
        />


        <button
          onClick={fetchBatch}
          style={buttonStyle}
        >
          Fetch Batch
        </button>


        {batch && (

          <>
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
              <strong>
                ID:
              </strong>{" "}
              {batch.id}
            </p>


            <p>
              <strong>
                Product:
              </strong>{" "}
              {batch.productName}
            </p>


            <p>
              <strong>
                Quantity:
              </strong>{" "}
              {batch.quantity}
            </p>


            <p>
              <strong>
                Manufacturing:
              </strong>{" "}
              {batch.manufactureDate}
            </p>


            <p>
              <strong>
                Expiry:
              </strong>{" "}
              {batch.expiryDate}
            </p>


            <p>
              <strong>
                Manufacturer:
              </strong>{" "}
              {batch.manufacturer}
            </p>


            <p>
              <strong>
                Current Owner:
              </strong>{" "}
              {batch.currentOwner}
            </p>


            <p>
              <strong>
                Status:
              </strong>{" "}
              {getStatusName(
                Number(batch.status)
              )}
            </p>

          </div>

          <div
  style={{
    marginTop: "25px",
    padding: "20px",
    background: "#ffffff",
    borderRadius: "10px",
    border: "1px solid #ddd",
  }}
>
  <h3>
    📍 Supply Chain Journey
  </h3>

  {statusSteps.map((step, index) => {

    const currentStatus =
      Number(batch.status);

    const completed =
      step.id <= currentStatus;

    return (
      <div
        key={step.id}
        style={{
          display: "flex",
          alignItems: "center",
          marginBottom:
            index === statusSteps.length - 1
              ? "0"
              : "15px",
        }}
      >

        <div
          style={{
            width: "42px",
            height: "42px",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: completed
              ? "#6c2bd9"
              : "#ddd",
            color: completed
              ? "white"
              : "#777",
            fontSize: "19px",
          }}
        >
          {step.icon}
        </div>

        <div
          style={{
            marginLeft: "12px",
          }}
        >
          <strong
          style={{
            color: completed
              ? "#222"
              : "#999",
          }}
        >
          {completed ? "✓ " : "○ "}
          {step.label}
        </strong>
        </div>

      </div>
    );
  })}
</div>

    </>
          

        )}
        <div
      style={{
        marginTop: "20px",
        background: "#f8f8f8",
        padding: "20px",
        borderRadius: "10px",
      }}
    >
      <h3>📜 Ownership History</h3>

      {ownershipHistory.map((record, index) => (

        <div
          key={index}
          style={{
            marginBottom: "20px",
            padding: "15px",
            background: "white",
            borderRadius: "8px",
            border: "1px solid #ddd",
          }}
        >

          <p>
            <strong>
              Record {index + 1}
            </strong>
          </p>

          <p>
            <strong>
              {getOwnerRole(record.role)}
            </strong>

          </p>

          <p>
            <strong>Wallet:</strong>{" "}
            {record.owner}
          </p>

          <p>
            <strong>Time:</strong>{" "}
            {new Date(
              record.timestamp * 1000
            ).toLocaleString()}
          </p>

          {index <
            ownershipHistory.length - 1 && (
            <p style={{ textAlign: "center" }}>
              ↓
            </p>
          )}

    </div>

  ))}
</div>

      </div>


   {/* =====================================================
    TRANSFER OWNERSHIP
===================================================== */}

      {(isManufacturer ||
        isTransporter ||
        isDistributor) && (

        <div style={cardStyle}>

          <h2>
            Transfer Medicine Batch
          </h2>

          <p style={{ color: "#666" }}>
            Your role: <strong>{role}</strong>
          </p>

          <input
            type="number"
            placeholder="Batch ID"
            value={transferId}
            onChange={(e) =>
              setTransferId(e.target.value)
            }
            style={inputStyle}
          />

          <div
            style={{
              background: "#f4f4f4",
              padding: "15px",
              borderRadius: "8px",
              marginBottom: "15px",
            }}
          >

            <p style={{ margin: "0 0 8px 0" }}>
              <strong>
                Transfer To:
              </strong>
            </p>

            <p style={{ margin: 0 }}>
              {isManufacturer && "Transporter"}

              {isTransporter && "Distributor"}

              {isDistributor && "Pharmacy"}
            </p>

          </div>

          <button
            onClick={transferOwnership}
            disabled={loading}
            style={buttonStyle}
          >
            {loading
              ? "Processing..."
              : isManufacturer
                ? "Transfer to Transporter"
                : isTransporter
                  ? "Transfer to Distributor"
                  : "Transfer to Pharmacy"}
          </button>

        </div>
      )}


      {/* =====================================================
          PHARMACY STATUS UPDATE
      ===================================================== */}

      {isPharmacy && (

        <div style={cardStyle}>

          <h2>
            Update Medicine Status
          </h2>

          <p style={{ color: "#666" }}>
            Your role: <strong>{role}</strong>
          </p>

          <input
            type="number"
            placeholder="Batch ID"
            value={statusBatchId}
            onChange={(e) =>
              setStatusBatchId(e.target.value)
            }
            style={inputStyle}
          />

          <button
            onClick={markAtPharmacy}
            disabled={loading}
            style={buttonStyle}
          >
            {loading
              ? "Processing..."
              : "Mark At Pharmacy"}
          </button>

          <button
            onClick={markDelivered}
            disabled={loading}
            style={{
              ...buttonStyle,
              marginTop: "10px",
            }}
          >
            {loading
              ? "Processing..."
              : "Mark Delivered"}
          </button>

        </div>
      )}

    </div>
  );
}

// =========================================================
// STYLES
// =========================================================

const cardStyle = {

  border : "1px solid #ff8894",

  padding: "20px",

  borderRadius: "10px",

  marginBottom: "30px",

};


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

  backgroundColor: "#5bc4f9",

  color: "white",

  fontSize: "16px",

  cursor: "pointer",

};


export default App;