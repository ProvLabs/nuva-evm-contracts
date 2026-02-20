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
    const newOwner = "0xDd3199E196BbF9A463500d5fB442FB7f78131F7a";

    console.log(`Simulating update as user: ${user.address}`);
    console.log(`Current Owner Address: ${oldOwner}`);

    // connect the `user` to the `crossChainManager` contract
    try {
        const transferTx = await crossChainManager.connect(user).transferOwnership(newOwner);
        const receipt = await transferTx.wait();

        console.log("   ✅ Transfer successful! Transaction hash:", receipt.hash);
        console.log(`Proposed Owner Address: ${newOwner}`);
    } catch (error) {
        console.log("Actual Revert Reason:", error);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
