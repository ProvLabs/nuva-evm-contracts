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
    const oldOwner = await crossChainManager.owner();

    console.log(`Simulating update as user: ${user.address}`);
    console.log(`Current Owner Address: ${oldOwner}`);

    // connect the `user` to the `crossChainManager` contract
    try {
        const acceptTx = await crossChainManager.connect(user).acceptOwnership();
        const receipt = await acceptTx.wait();

        console.log("   ✅ Update successful! Transaction hash:", receipt.hash);
        console.log(`Ownership Accepted!`);
    } catch (error) {
        console.log("Actual Revert Reason:", error);
    }

    const newOwner = await crossChainManager.owner();
    console.log(`New Owner Address: ${newOwner}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
