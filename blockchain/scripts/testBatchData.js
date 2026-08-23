const { ethers } = require("hardhat");

async function main() {

    const [
        admin,
        manufacturer
    ] = await ethers.getSigners();

    const SupplyChain =
        await ethers.getContractFactory("SupplyChain");

    const contract = SupplyChain.attach(
        "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512"
    );

    console.log("\n================================");
    console.log("       BATCH DATA TEST");
    console.log("================================\n");


    // =========================================================
    // REGISTER A TEST BATCH
    // =========================================================

    console.log("Creating test batch...");

    const manufactureDate =
        Math.floor(
            new Date("2026-08-19").getTime() / 1000
        );

    const expiryDate =
        Math.floor(
            new Date("2028-08-19").getTime() / 1000
        );


    const tx = await contract
        .connect(manufacturer)
        .registerBatch(
            "Paracetamol 500mg",
            1000,
            manufactureDate,
            expiryDate
        );

    await tx.wait();

    console.log("✅ Batch successfully created");


    // =========================================================
    // GET BATCH
    // =========================================================

    console.log("\nFetching batch from blockchain...");

    const batch =
        await contract.getBatch(1);


    // =========================================================
    // DISPLAY DATA
    // =========================================================

    console.log("\n========== BATCH DETAILS ==========");

    console.log("Batch ID:", batch.id.toString());

    console.log("Product Name:", batch.productName);

    console.log("Quantity:", batch.quantity.toString());

    console.log(
        "Manufacturing Date:",
        new Date(
            Number(batch.manufactureDate) * 1000
        ).toLocaleDateString()
    );

    console.log(
        "Expiry Date:",
        new Date(
            Number(batch.expiryDate) * 1000
        ).toLocaleDateString()
    );

    console.log(
        "Manufacturer:",
        batch.manufacturer
    );

    console.log(
        "Current Owner:",
        batch.currentOwner
    );

    console.log(
        "Status:",
        batch.status.toString()
    );

    console.log(
        "Exists:",
        batch.exists
    );


    // =========================================================
    // OWNERSHIP HISTORY
    // =========================================================

    console.log("\n====== OWNERSHIP HISTORY ======");

    const history =
        await contract.getOwnershipHistory(1);

    console.log(
        "Number of ownership records:",
        history.length
    );

    for (
        let i = 0;
        i < history.length;
        i++
    ) {

        console.log(
            `Record ${i + 1}:`
        );

        console.log(
            "  Owner:",
            history[i].owner
        );

        console.log(
            "  Timestamp:",
            new Date(
                Number(history[i].timestamp) * 1000
            ).toLocaleString()
        );
    }


    console.log("\n================================");
    console.log("       BATCH DATA TEST COMPLETE");
    console.log("================================\n");
}


main().catch((error) => {

    console.error(error);

    process.exitCode = 1;
});