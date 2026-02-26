const { ethers } = require("hardhat");

async function main() {
    const PROXY_ADDRESS = process.env.CROSS_CHAIN_MANAGER_PROXY_BASE;
    if (!PROXY_ADDRESS) {
        throw new Error("CROSS_CHAIN_MANAGER_PROXY_BASE is not set.");
    }

    // Get contract instance
    const manager = await ethers.getContractAt("CrossChainManager", PROXY_ADDRESS);

    console.log("Fetching aml signer address...");
    const vault = await manager.amlSigner();

    console.log("Aml Signer Address:", vault);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
