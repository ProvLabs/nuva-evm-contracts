const { ethers } = require("hardhat");

async function main() {
    const PROXY_ADDRESS = process.env.CROSS_CHAIN_MANAGER_PROXY_ETH;
    if (!PROXY_ADDRESS) {
        throw new Error("CROSS_CHAIN_MANAGER_PROXY_ETH is not set.");
    }

    // Get contract instance
    const manager = await ethers.getContractAt("CrossChainManager", PROXY_ADDRESS);

    console.log("Fetching cross chain vault address...");
    const vault = await manager.crossChainVault();

    console.log("Cross Chain Vault Address:", vault);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
