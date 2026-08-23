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
    console.log("   UNAUTHORIZED TRANSFER SECURITY TEST");
    console.log("========================================\n");


    // =========================================================
    // CHECK CURRENT OWNER
    // =========================================================

    const batch =
        await contract.getBatch(1);

    console.log(
        "Current Owner:",
        batch.currentOwner
    );

    console.log(
        "Expected Pharmacy:",
        pharmacy.address
    );


    // =========================================================
    // TEST 1 — MANUFACTURER
    // =========================================================

    console.log(
        "\nTEST 1: Manufacturer trying to transfer batch"
    );

    try {

        const tx = await contract
            .connect(manufacturer)
            .transferOwnership(
                1,
                transporter.address
            );

        await tx.wait();

        console.log(
            "❌ FAILED: Manufacturer was able to transfer"
        );

    } catch (error) {

        console.log(
            "✅ PASSED: Manufacturer was rejected"
        );
    }


    // =========================================================
    // TEST 2 — TRANSPORTER
    // =========================================================

    console.log(
        "\nTEST 2: Transporter trying to transfer batch"
    );

    try {

        const tx = await contract
            .connect(transporter)
            .transferOwnership(
                1,
                distributor.address
            );

        await tx.wait();

        console.log(
            "❌ FAILED: Transporter was able to transfer"
        );

    } catch (error) {

        console.log(
            "✅ PASSED: Transporter was rejected"
        );
    }


    // =========================================================
    // TEST 3 — DISTRIBUTOR
    // =========================================================

    console.log(
        "\nTEST 3: Distributor trying to transfer batch"
    );

    try {

        const tx = await contract
            .connect(distributor)
            .transferOwnership(
                1,
                manufacturer.address
            );

        await tx.wait();

        console.log(
            "❌ FAILED: Distributor was able to transfer"
        );

    } catch (error) {

        console.log(
            "✅ PASSED: Distributor was rejected"
        );
    }


    // =========================================================
    // FINAL CHECK
    // =========================================================

    const finalBatch =
        await contract.getBatch(1);

    console.log(
        "\nFinal Owner:",
        finalBatch.currentOwner
    );

    console.log(
        "Expected Owner:",
        pharmacy.address
    );


    console.log("\n========================================");
    console.log("   UNAUTHORIZED TRANSFER TEST COMPLETE");
    console.log("========================================\n");
}


main().catch((error) => {

    console.error(error);

    process.exitCode = 1;
});