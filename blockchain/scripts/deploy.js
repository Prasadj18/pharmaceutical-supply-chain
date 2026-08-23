const { ethers } = require("hardhat");

async function main() {
    console.log("Deploying SupplyChain contract...");

    const SupplyChain = await ethers.getContractFactory("SupplyChain");

    const contract = await SupplyChain.deploy();

    await contract.deployed();

    console.log("SupplyChain deployed at:", contract.address);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});