const { ethers } = require("hardhat");

async function main() {

    // Get Hardhat accounts
    const [admin, manufacturer, transporter, distributor, pharmacy] =
        await ethers.getSigners();

    console.log("\n=== TEST ACCOUNTS ===");

    console.log("Admin:        ", admin.address);
    console.log("Manufacturer: ", manufacturer.address);
    console.log("Transporter:  ", transporter.address);
    console.log("Distributor:  ", distributor.address);
    console.log("Pharmacy:     ", pharmacy.address);


    // Connect to deployed contract
    const contractAddress =
        "0x5FbDB2315678afecb367f032d93F642f64180aa3";

    const SupplyChain =
        await ethers.getContractFactory("SupplyChain");

    const contract =
        SupplyChain.attach(contractAddress);


    console.log("\n=== CURRENT ADMIN ROLE ===");

    const adminRole =
        await contract.getRole(admin.address);

    console.log(
        "Admin role value:",
        adminRole.toString()
    );


    console.log("\n=== ASSIGNING ROLES ===");


    // MANUFACTURER = 2

    let tx =
        await contract
            .connect(admin)
            .assignRole(
                manufacturer.address,
                2
            );

    await tx.wait();

    console.log(
        "Manufacturer role assigned:",
        manufacturer.address
    );


    // TRANSPORTER = 3

    tx =
        await contract
            .connect(admin)
            .assignRole(
                transporter.address,
                3
            );

    await tx.wait();

    console.log(
        "Transporter role assigned:",
        transporter.address
    );


    // DISTRIBUTOR = 4

    tx =
        await contract
            .connect(admin)
            .assignRole(
                distributor.address,
                4
            );

    await tx.wait();

    console.log(
        "Distributor role assigned:",
        distributor.address
    );


    // PHARMACY = 5

    tx =
        await contract
            .connect(admin)
            .assignRole(
                pharmacy.address,
                5
            );

    await tx.wait();

    console.log(
        "Pharmacy role assigned:",
        pharmacy.address
    );


    console.log("\n=== VERIFYING ROLES ===");


    console.log(
        "Admin:",
        (await contract.getRole(admin.address)).toString()
    );

    console.log(
        "Manufacturer:",
        (await contract.getRole(manufacturer.address)).toString()
    );

    console.log(
        "Transporter:",
        (await contract.getRole(transporter.address)).toString()
    );

    console.log(
        "Distributor:",
        (await contract.getRole(distributor.address)).toString()
    );

    console.log(
        "Pharmacy:",
        (await contract.getRole(pharmacy.address)).toString()
    );


    console.log("\n=== ROLE TEST COMPLETE ===");
}


main().catch((error) => {

    console.error(error);

    process.exitCode = 1;

});