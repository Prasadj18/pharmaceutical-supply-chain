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
    console.log("       RBAC SECURITY TEST");
    console.log("================================\n");

    // ---------------------------------------------------------
    // TEST 1: Admin can assign a role
    // ---------------------------------------------------------

    console.log("TEST 1: Admin assigning role");

    try {

        const tx = await contract
            .connect(admin)
            .assignRole(
                pharmacy.address,
                5
            );

        await tx.wait();

        console.log("✅ PASSED: Admin can assign roles");

    } catch (error) {

        console.log(" FAILED: Admin should be able to assign roles");
    }


    // ---------------------------------------------------------
    // TEST 2: Manufacturer cannot assign a role
    // ---------------------------------------------------------

    console.log("\nTEST 2: Manufacturer trying to assign role");

    try {

        const tx = await contract
            .connect(manufacturer)
            .assignRole(
                pharmacy.address,
                5
            );

        await tx.wait();

        console.log(
            " FAILED: Manufacturer was able to assign a role"
        );

    } catch (error) {

        console.log(
            "✅ PASSED: Manufacturer was correctly rejected"
        );
    }


    // ---------------------------------------------------------
    // TEST 3: Transporter cannot assign a role
    // ---------------------------------------------------------

    console.log("\nTEST 3: Transporter trying to assign role");

    try {

        const tx = await contract
            .connect(transporter)
            .assignRole(
                distributor.address,
                4
            );

        await tx.wait();

        console.log(
            " FAILED: Transporter was able to assign a role"
        );

    } catch (error) {

        console.log(
            "✅ PASSED: Transporter was correctly rejected"
        );
    }


    // ---------------------------------------------------------
    // TEST 4: Pharmacy cannot assign a role
    // ---------------------------------------------------------

    console.log("\nTEST 4: Pharmacy trying to assign role");

    try {

        const tx = await contract
            .connect(pharmacy)
            .assignRole(
                transporter.address,
                3
            );

        await tx.wait();

        console.log(
            " FAILED: Pharmacy was able to assign a role"
        );

    } catch (error) {

        console.log(
            "✅ PASSED: Pharmacy was correctly rejected"
        );
    }


    console.log("\n================================");
    console.log("       RBAC TEST COMPLETE");
    console.log("================================\n");
}

main().catch((error) => {

    console.error(error);

    process.exitCode = 1;
});