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
        "0xa513E6E4b8f2a923D98304ec87F64353C4D5C853"
    );

    console.log("\n========================================");
    console.log("       STATUS WORKFLOW TEST");
    console.log("========================================\n");


    // =========================================================
    // STEP 1 — ASSIGN ROLES
    // =========================================================

    console.log("STEP 1: Assigning stakeholder roles...");

    await (
        await contract
            .connect(admin)
            .assignRole(manufacturer.address, 2)
    ).wait();

    await (
        await contract
            .connect(admin)
            .assignRole(transporter.address, 3)
    ).wait();

    await (
        await contract
            .connect(admin)
            .assignRole(distributor.address, 4)
    ).wait();

    await (
        await contract
            .connect(admin)
            .assignRole(pharmacy.address, 5)
    ).wait();

    console.log("✅ Roles assigned");


    // =========================================================
    // STEP 2 — CREATE BATCH
    // =========================================================

    console.log("\nSTEP 2: Manufacturer creating batch...");

    const manufactureDate =
        Math.floor(
            new Date("2026-08-19").getTime() / 1000
        );

    const expiryDate =
        Math.floor(
            new Date("2028-08-19").getTime() / 1000
        );

    await (
        await contract
            .connect(manufacturer)
            .registerBatch(
                "Paracetamol 500mg",
                1000,
                manufactureDate,
                expiryDate
            )
    ).wait();

    console.log("✅ Batch created");


    // =========================================================
    // STEP 3 — CHECK INITIAL STATUS
    // =========================================================

    let batch =
        await contract.getBatch(1);

    console.log(
        "\nInitial Status:",
        batch.status.toString()
    );

    if (batch.status.toString() === "0") {

        console.log(
            "✅ PASSED: Initial status is MANUFACTURED"
        );

    } else {

        console.log(
            "❌ FAILED: Initial status should be MANUFACTURED"
        );
    }


    // =========================================================
    // STEP 4 — MANUFACTURER → TRANSPORTER
    // =========================================================

    console.log(
        "\nSTEP 4: Manufacturer → Transporter"
    );

    await (
        await contract
            .connect(manufacturer)
            .transferOwnership(
                1,
                transporter.address
            )
    ).wait();

    batch =
        await contract.getBatch(1);

    console.log(
        "Current Owner:",
        batch.currentOwner
    );

    console.log(
        "Status:",
        batch.status.toString()
    );

    if (
        batch.currentOwner.toLowerCase() ===
        transporter.address.toLowerCase() &&
        batch.status.toString() === "1"
    ) {

        console.log(
            "✅ PASSED: Status changed to IN_TRANSIT"
        );

    } else {

        console.log(
            "❌ FAILED: Transfer/status incorrect"
        );
    }


    // =========================================================
    // STEP 5 — TRANSPORTER → DISTRIBUTOR
    // =========================================================

    console.log(
        "\nSTEP 5: Transporter → Distributor"
    );

    await (
        await contract
            .connect(transporter)
            .transferOwnership(
                1,
                distributor.address
            )
    ).wait();

    batch =
        await contract.getBatch(1);

    console.log(
        "Current Owner:",
        batch.currentOwner
    );

    console.log(
        "Status:",
        batch.status.toString()
    );


    // =========================================================
    // STEP 6 — DISTRIBUTOR SETS AT_DISTRIBUTOR
    // =========================================================

    console.log(
        "\nSTEP 6: Distributor → AT_DISTRIBUTOR"
    );

    await (
        await contract
            .connect(distributor)
            .updateBatchStatus(
                1,
                2
            )
    ).wait();

    batch =
        await contract.getBatch(1);

    console.log(
        "Status:",
        batch.status.toString()
    );

    if (batch.status.toString() === "2") {

        console.log(
            "✅ PASSED: Status is AT_DISTRIBUTOR"
        );

    } else {

        console.log(
            "❌ FAILED: Distributor status update failed"
        );
    }


    // =========================================================
    // STEP 7 — DISTRIBUTOR → PHARMACY
    // =========================================================

    console.log(
        "\nSTEP 7: Distributor → Pharmacy"
    );

    await (
        await contract
            .connect(distributor)
            .transferOwnership(
                1,
                pharmacy.address
            )
    ).wait();

    batch =
        await contract.getBatch(1);

    console.log(
        "Current Owner:",
        batch.currentOwner
    );

    console.log(
        "Status:",
        batch.status.toString()
    );


    // =========================================================
    // STEP 8 — PHARMACY SETS AT_PHARMACY
    // =========================================================

    console.log(
        "\nSTEP 8: Pharmacy → AT_PHARMACY"
    );

    await (
        await contract
            .connect(pharmacy)
            .updateBatchStatus(
                1,
                3
            )
    ).wait();

    batch =
        await contract.getBatch(1);

    console.log(
        "Status:",
        batch.status.toString()
    );

    if (batch.status.toString() === "3") {

        console.log(
            "✅ PASSED: Status is AT_PHARMACY"
        );

    } else {

        console.log(
            "❌ FAILED: Pharmacy status update failed"
        );
    }


    // =========================================================
    // STEP 9 — PHARMACY → DELIVERED
    // =========================================================

    console.log(
        "\nSTEP 9: Pharmacy → DELIVERED"
    );

    await (
        await contract
            .connect(pharmacy)
            .updateBatchStatus(
                1,
                4
            )
    ).wait();

    batch =
        await contract.getBatch(1);

    console.log(
        "Final Status:",
        batch.status.toString()
    );

    if (batch.status.toString() === "4") {

        console.log(
            "✅ PASSED: Batch marked DELIVERED"
        );

    } else {

        console.log(
            "❌ FAILED: Delivery status failed"
        );
    }


    // =========================================================
    // FINAL
    // =========================================================

    console.log("\n========================================");
    console.log("       STATUS WORKFLOW COMPLETE");
    console.log("========================================\n");
}


main().catch((error) => {

    console.error(error);

    process.exitCode = 1;
});