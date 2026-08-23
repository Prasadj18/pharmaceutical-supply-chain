const { ethers } = require("hardhat");

async function main() {

    const [
        admin,
        manufacturer,
        transporter,
        distributor,
        pharmacy
    ] = await ethers.getSigners();

    const SupplyChain =
        await ethers.getContractFactory("SupplyChain");

    const contract = SupplyChain.attach(
        "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512"
    );

    console.log("\n========================================");
    console.log("   OWNERSHIP TRANSFER + HISTORY TEST");
    console.log("========================================\n");


    // =========================================================
    // STEP 1 — CHECK INITIAL OWNER
    // =========================================================

    console.log("STEP 1: Checking initial owner...");

    let batch = await contract.getBatch(1);

    console.log(
        "Initial Owner:",
        batch.currentOwner
    );

    console.log(
        "Manufacturer:",
        manufacturer.address
    );


    // =========================================================
    // STEP 2 — MANUFACTURER → TRANSPORTER
    // =========================================================

    console.log("\nSTEP 2: Manufacturer → Transporter");

    try {

        const tx = await contract
            .connect(manufacturer)
            .transferOwnership(
                1,
                transporter.address
            );

        await tx.wait();

        console.log(
            "✅ Ownership transferred to Transporter"
        );

    } catch (error) {

        console.log(
            "❌ Transfer failed"
        );

        console.log(error.message);

        return;
    }


    // Check current owner

    batch = await contract.getBatch(1);

    console.log(
        "Current Owner:",
        batch.currentOwner
    );

    console.log(
        "Status:",
        batch.status.toString()
    );


    // =========================================================
    // STEP 3 — TRANSPORTER → DISTRIBUTOR
    // =========================================================

    console.log("\nSTEP 3: Transporter → Distributor");

    try {

        const tx = await contract
            .connect(transporter)
            .transferOwnership(
                1,
                distributor.address
            );

        await tx.wait();

        console.log(
            "✅ Ownership transferred to Distributor"
        );

    } catch (error) {

        console.log(
            "❌ Transfer failed"
        );

        console.log(error.message);

        return;
    }


    batch = await contract.getBatch(1);

    console.log(
        "Current Owner:",
        batch.currentOwner
    );

    console.log(
        "Status:",
        batch.status.toString()
    );


    // =========================================================
    // STEP 4 — DISTRIBUTOR → PHARMACY
    // =========================================================

    console.log("\nSTEP 4: Distributor → Pharmacy");

    try {

        const tx = await contract
            .connect(distributor)
            .transferOwnership(
                1,
                pharmacy.address
            );

        await tx.wait();

        console.log(
            "✅ Ownership transferred to Pharmacy"
        );

    } catch (error) {

        console.log(
            "❌ Transfer failed"
        );

        console.log(error.message);

        return;
    }


    batch = await contract.getBatch(1);

    console.log(
        "Current Owner:",
        batch.currentOwner
    );

    console.log(
        "Status:",
        batch.status.toString()
    );


    // =========================================================
    // STEP 5 — GET OWNERSHIP HISTORY
    // =========================================================

    console.log("\n========================================");
    console.log("        OWNERSHIP HISTORY");
    console.log("========================================");

    const history =
        await contract.getOwnershipHistory(1);

    console.log(
        "\nTotal ownership records:",
        history.length
    );


    for (
        let i = 0;
        i < history.length;
        i++
    ) {

        console.log(
            `\nRecord ${i + 1}`
        );

        console.log(
            "Owner:",
            history[i].owner
        );

        console.log(
            "Timestamp:",
            new Date(
                Number(history[i].timestamp) * 1000
            ).toLocaleString()
        );
    }


    // =========================================================
    // FINAL RESULT
    // =========================================================

    console.log("\n========================================");
    console.log("           FINAL BATCH STATE");
    console.log("========================================");

    console.log(
        "Batch ID:",
        batch.id.toString()
    );

    console.log(
        "Product:",
        batch.productName
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
        "\n========================================"
    );

    console.log(
        "   OWNERSHIP TEST COMPLETE"
    );

    console.log(
        "========================================\n"
    );
}


main().catch((error) => {

    console.error(error);

    process.exitCode = 1;
});