// scripts/makeDeposit.js
const { ethers } = require("hardhat");

// --- START: Configuration ---
const CROSS_CHAIN_MANAGER_ADDRESS = process.env.CROSS_CHAIN_MANAGER_PROXY_BASE;
if (!CROSS_CHAIN_MANAGER_ADDRESS) {
    throw new Error("CROSS_CHAIN_MANAGER_PROXY_BASE is not set.");
}
// --- END: Configuration ---

async function main() {
    // Get our "user" (signer 1)
    const [user] = await ethers.getSigners();

    // Get contract instances
    const crossChainManager = await ethers.getContractAt("CrossChainManager", CROSS_CHAIN_MANAGER_ADDRESS);
    
    const owner = await crossChainManager.owner();
    console.log(`Current Owner Address: ${owner}`);

    const pendingOwner = await crossChainManager.pendingOwner();
    console.log(`Pending Owner Address: ${pendingOwner}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
