// scripts/javascript/libraries/deployAMLUtils.js

const { ethers } = require("hardhat");
const { saveDeploymentInfo } = require("../../utils/deployment");

async function main() {
    // Get the deployer's address and balance
    const [deployer] = await ethers.getSigners();
    console.log("Deploying AMLUtils with the account:", deployer.address);

    // Since AMLUtils is a library, we'll deploy a test contract that uses it
    // to demonstrate its functionality
    console.log("Deploying test contract that uses AMLUtils...");

    // Deploy a test contract that uses the AMLUtils library
    const AMLTestContract = await ethers.getContractFactory("AMLTestContract", {
        libraries: {
            AMLUtils: "0x...", // The deployed AMLUtils library address (if already deployed)
        },
    });

    // If you haven't deployed AMLUtils separately, you can deploy it with the contract
    // by using the `libraries` option in the deploy function
    const amlTest = await AMLTestContract.deploy();
    await amlTest.waitForDeployment();

    console.log("✅ AMLTestContract deployed to:", await amlTest.getAddress());

    // Save deployment info to a JSON file for future reference
    await saveDeploymentInfo("AMLTestContract", {
        address: await amlTest.getAddress(),
        deployer: deployer.address,
        timestamp: Math.floor(Date.now() / 1000),
    });

    console.log("✅ Deployment info saved");
}

// Standard Hardhat script runner
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
