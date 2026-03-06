const { ethers } = require("hardhat");

// --- START: Configuration ---
const CROSS_CHAIN_MANAGER_ADDRESS = process.env.CROSS_CHAIN_MANAGER_PROXY_ETH;
if (!CROSS_CHAIN_MANAGER_ADDRESS) {
    throw new Error("CROSS_CHAIN_MANAGER_PROXY_ETH is not set.");
}

const CROSS_CHAIN_VAULT_ADDRESS = process.env.VAULT_CROSS_CHAIN_PROXY_ETH;
if (!CROSS_CHAIN_VAULT_ADDRESS) {
    throw new Error("VAULT_CROSS_CHAIN_PROXY_ETH is not set.");
}
// --- END: Configuration ---

async function main() {
    // Get our "user" (signer 1)
    const [user] = await ethers.getSigners();

    // Get contract instances
    const crossChainManager = await ethers.getContractAt("CrossChainManager", CROSS_CHAIN_MANAGER_ADDRESS);
    const oldCrossChainVault = await crossChainManager.crossChainVault();

    console.log(`Simulating update as user: ${user.address}`);
    console.log(`Current Cross Chain Vault Address: ${oldCrossChainVault}`);

    // connect the `user` to the `crossChainManager` contract
    try {
        const updateTx = await crossChainManager.connect(user).updateCrossChainConfig(CROSS_CHAIN_VAULT_ADDRESS);
        const receipt = await updateTx.wait();

        console.log("   ✅ Update successful! Transaction hash:", receipt.hash);
        console.log(`Updated Cross Chain Vault Address: ${CROSS_CHAIN_VAULT_ADDRESS}`);
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
