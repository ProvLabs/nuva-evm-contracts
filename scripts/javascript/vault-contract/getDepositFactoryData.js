// scripts/fullDepositWithPermit.js
const { ethers } = require("hardhat");

// --- START: Configuration ---
const DEPOSITOR_FACTORY_ADDRESS = process.env.DEPOSITOR_FACTORY_CONTRACT;
if (!DEPOSITOR_FACTORY_ADDRESS) {
    throw new Error("DEPOSITOR_FACTORY_CONTRACT is not set.");
}

const DEPOSIT_TOKEN_ADDRESS = process.env.TOKEN_ADDRESS;
if (!DEPOSIT_TOKEN_ADDRESS) {
    throw new Error("TOKEN_ADDRESS is not set.");
}

const SHARE_TOKEN_ADDRESS = process.env.SHARED_TOKEN_ADDRESS;
if (!SHARE_TOKEN_ADDRESS) {
    throw new Error("SHARED_TOKEN_ADDRESS is not set.");
}
// --- Main Script ---
async function main() {
    // Get the Depositor contract instance
    const depositor = await ethers.getContractAt("DepositorFactory", DEPOSITOR_FACTORY_ADDRESS);
    console.log("Depositor contract:", depositor.target);
    console.log("impl:", await depositor.implementation());
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
