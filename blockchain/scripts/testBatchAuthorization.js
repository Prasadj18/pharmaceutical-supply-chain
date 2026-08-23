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

    console.log("\n================================");
    console.log("   BATCH AUTHORIZATION TEST");
    console.log("================================\n");


    // =========================================================
    // TEST 1 — MANUFACTURER
    // =========================================================

    console.log("TEST 1: Manufacturer registering batch");

    try {

        const tx = await contract
            .connect(manufacturer)
            .registerBatch(
                "Paracetamol 500mg",
                1000,
                1755561600,
                1818710400
            );

        const receipt = await tx.wait();

        console.log(
            "✅ PASSED: Manufacturer can register batches"
        );

    } catch (error) {

        console.log(
            "❌ FAILED: Manufacturer should be able to register"
        );

        console.log(error.message);
    }


    // =========================================================
    // TEST 2 — TRANSPORTER
    // =========================================================

    console.log("\nTEST 2: Transporter trying to register batch");

    try {

        const tx = await contract
            .connect(transporter)
            .registerBatch(
                "Paracetamol 500mg",
                500,
                1755561600,
                1818710400
            );

        await tx.wait();

        console.log(
            "❌ FAILED: Transporter was able to register batch"
        );

    } catch (error) {

        console.log(
            "✅ PASSED: Transporter was correctly rejected"
        );
    }


    // =========================================================
    // TEST 3 — DISTRIBUTOR
    // =========================================================

    console.log("\nTEST 3: Distributor trying to register batch");

    try {

        const tx = await contract
            .connect(distributor)
            .registerBatch(
                "Paracetamol 500mg",
                500,
                1755561600,
                1818710400
            );

        await tx.wait();

        console.log(
            "❌ FAILED: Distributor was able to register batch"
        );

    } catch (error) {

        console.log(
            "✅ PASSED: Distributor was correctly rejected"
        );
    }


    // =========================================================
    // TEST 4 — PHARMACY
    // =========================================================

    console.log("\nTEST 4: Pharmacy trying to register batch");

    try {

        const tx = await contract
            .connect(pharmacy)
            .registerBatch(
                "Paracetamol 500mg",
                500,
                1755561600,
                1818710400
            );

        await tx.wait();

        console.log(
            "❌ FAILED: Pharmacy was able to register batch"
        );

    } catch (error) {

        console.log(
            "✅ PASSED: Pharmacy was correctly rejected"
        );
    }


    console.log("\n================================");
    console.log("   BATCH AUTHORIZATION COMPLETE");
    console.log("================================\n");
}

main().catch((error) => {

    console.error(error);

    process.exitCode = 1;
});