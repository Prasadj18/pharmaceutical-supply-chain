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
    console.log("       INPUT VALIDATION TEST");
    console.log("========================================\n");


    // =========================================================
    // VALID DATES
    // =========================================================

    const manufactureDate =
        Math.floor(
            new Date("2026-08-19").getTime() / 1000
        );

    const expiryDate =
        Math.floor(
            new Date("2028-08-19").getTime() / 1000
        );


    // =========================================================
    // TEST 1 — EMPTY PRODUCT NAME
    // =========================================================

    console.log(
        "TEST 1: Empty product name"
    );

    try {

        const tx = await contract
            .connect(manufacturer)
            .registerBatch(
                "",
                1000,
                manufactureDate,
                expiryDate
            );

        await tx.wait();

        console.log(
            "❌ FAILED: Empty product name was accepted"
        );

    } catch (error) {

        console.log(
            "✅ PASSED: Empty product name was rejected"
        );
    }


    // =========================================================
    // TEST 2 — ZERO QUANTITY
    // =========================================================

    console.log(
        "\nTEST 2: Zero quantity"
    );

    try {

        const tx = await contract
            .connect(manufacturer)
            .registerBatch(
                "Paracetamol 500mg",
                0,
                manufactureDate,
                expiryDate
            );

        await tx.wait();

        console.log(
            "❌ FAILED: Zero quantity was accepted"
        );

    } catch (error) {

        console.log(
            "✅ PASSED: Zero quantity was rejected"
        );
    }


    // =========================================================
    // TEST 3 — INVALID EXPIRY DATE
    // =========================================================

    console.log(
        "\nTEST 3: Expiry date before manufacture date"
    );

    const invalidExpiryDate =
        Math.floor(
            new Date("2025-08-19").getTime() / 1000
        );

    try {

        const tx = await contract
            .connect(manufacturer)
            .registerBatch(
                "Paracetamol 500mg",
                1000,
                manufactureDate,
                invalidExpiryDate
            );

        await tx.wait();

        console.log(
            "❌ FAILED: Invalid expiry date was accepted"
        );

    } catch (error) {

        console.log(
            "✅ PASSED: Invalid expiry date was rejected"
        );
    }


    // =========================================================
    // TEST 4 — INVALID NEW OWNER
    // =========================================================

    console.log(
        "\nTEST 4: Invalid new owner address"
    );

    try {

        const tx = await contract
            .connect(pharmacy)
            .transferOwnership(
                1,
                ethers.constants.AddressZero
            );

        await tx.wait();

        console.log(
            "❌ FAILED: Zero address was accepted"
        );

    } catch (error) {

        console.log(
            "✅ PASSED: Zero address was rejected"
        );
    }


    console.log("\n========================================");
    console.log("       INPUT VALIDATION COMPLETE");
    console.log("========================================\n");
}


main().catch((error) => {

    console.error(error);

    process.exitCode = 1;
});