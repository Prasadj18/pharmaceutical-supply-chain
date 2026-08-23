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
    console.log("   UNAUTHORIZED STATUS SECURITY TEST");
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
    // STEP 2 — CREATE NEW BATCH
    // =========================================================

    console.log("\nSTEP 2: Manufacturer creating new batch...");

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
            "Paracetamol 500mg - Security Test",
            1000,
            manufactureDate,
            expiryDate
        );

    const receipt = await tx.wait();


    // =========================================================
    // GET ACTUAL BATCH ID FROM EVENT
    // =========================================================

    const batchRegisteredEvent =
        receipt.events.find(
            (event) =>
                event.event === "BatchRegistered"
        );

    const batchId =
        batchRegisteredEvent.args.batchId;

    console.log(
        "✅ Batch created"
    );

    console.log(
        "New Batch ID:",
        batchId.toString()
    );


    // =========================================================
    // VERIFY CURRENT OWNER
    // =========================================================

    let batch =
        await contract.getBatch(batchId);

    console.log(
        "Initial Owner:",
        batch.currentOwner
    );

    console.log(
        "Manufacturer:",
        manufacturer.address
    );


    // =========================================================
    // STEP 3 — MANUFACTURER → TRANSPORTER
    // =========================================================

    console.log(
        "\nSTEP 3: Manufacturer → Transporter"
    );

    await (
        await contract
            .connect(manufacturer)
            .transferOwnership(
                batchId,
                transporter.address
            )
    ).wait();

    console.log(
        "✅ Manufacturer → Transporter"
    );


    // =========================================================
    // STEP 4 — TRANSPORTER → DISTRIBUTOR
    // =========================================================

    console.log(
        "\nSTEP 4: Transporter → Distributor"
    );

    await (
        await contract
            .connect(transporter)
            .transferOwnership(
                batchId,
                distributor.address
            )
    ).wait();

    console.log(
        "✅ Transporter → Distributor"
    );


    // =========================================================
    // TEST 1 — TRANSPORTER TRYING AT_DISTRIBUTOR
    // =========================================================

    console.log(
        "\nTEST 1: Transporter trying AT_DISTRIBUTOR"
    );

    try {

        await (
            await contract
                .connect(transporter)
                .updateBatchStatus(
                    batchId,
                    2
                )
        ).wait();

        console.log(
            "❌ FAILED: Transporter was allowed"
        );

    } catch (error) {

        console.log(
            "✅ PASSED: Transporter was rejected"
        );
    }


    // =========================================================
    // TEST 2 — DISTRIBUTOR TRYING DELIVERED
    // =========================================================

    console.log(
        "\nTEST 2: Distributor trying DELIVERED"
    );

    try {

        await (
            await contract
                .connect(distributor)
                .updateBatchStatus(
                    batchId,
                    4
                )
        ).wait();

        console.log(
            "❌ FAILED: Distributor was allowed"
        );

    } catch (error) {

        console.log(
            "✅ PASSED: Distributor was rejected"
        );
    }


    // =========================================================
    // STEP 5 — DISTRIBUTOR → PHARMACY
    // =========================================================

    console.log(
        "\nSTEP 5: Distributor → Pharmacy"
    );

    await (
        await contract
            .connect(distributor)
            .transferOwnership(
                batchId,
                pharmacy.address
            )
    ).wait();

    console.log(
        "✅ Distributor → Pharmacy"
    );


    // =========================================================
    // TEST 3 — PHARMACY TRYING AT_DISTRIBUTOR
    // =========================================================

    console.log(
        "\nTEST 3: Pharmacy trying AT_DISTRIBUTOR"
    );

    try {

        await (
            await contract
                .connect(pharmacy)
                .updateBatchStatus(
                    batchId,
                    2
                )
        ).wait();

        console.log(
            "❌ FAILED: Pharmacy was allowed"
        );

    } catch (error) {

        console.log(
            "✅ PASSED: Pharmacy was rejected"
        );
    }


    // =========================================================
    // TEST 4 — MANUFACTURER TRYING DELIVERED
    // =========================================================

    console.log(
        "\nTEST 4: Manufacturer trying DELIVERED"
    );

    try {

        await (
            await contract
                .connect(manufacturer)
                .updateBatchStatus(
                    batchId,
                    4
                )
        ).wait();

        console.log(
            "❌ FAILED: Manufacturer was allowed"
        );

    } catch (error) {

        console.log(
            "✅ PASSED: Manufacturer was rejected"
        );
    }


    // =========================================================
    // FINAL OWNER CHECK
    // =========================================================

    batch =
        await contract.getBatch(batchId);

    console.log(
        "\nFinal Owner:",
        batch.currentOwner
    );

    console.log(
        "Expected Owner:",
        pharmacy.address
    );


    console.log("\n========================================");
    console.log("   UNAUTHORIZED STATUS TEST COMPLETE");
    console.log("========================================\n");
}


main().catch((error) => {

    console.error(error);

    process.exitCode = 1;
});