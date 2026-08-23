const { ethers } = require("hardhat");

async function main() {

    const contractAddress =
        "0x5FbDB2315678afecb367f032d93F642f64180aa3";

    const SupplyChain =
        await ethers.getContractFactory("SupplyChain");

    const contract =
        SupplyChain.attach(contractAddress);

    console.log("\n================================");
    console.log("      OWNERSHIP HISTORY TEST");
    console.log("================================");

    const batchId = 1;

    console.log("\nFetching history for Batch:", batchId);

    const history =
        await contract.getOwnershipHistory(batchId);

    console.log(
        "\nNumber of ownership records:",
        history.length
    );

    history.forEach((record, index) => {

        console.log(`\nRecord ${index + 1}`);

        console.log(
            "Owner:",
            record.owner
        );

        console.log(
            "Timestamp:",
            new Date(
                Number(record.timestamp) * 1000
            ).toLocaleString()
        );

    });

    console.log("\n================================");
    console.log("   HISTORY TEST COMPLETE");
    console.log("================================");
}

main().catch((error) => {

    console.error(error);

    process.exitCode = 1;

});