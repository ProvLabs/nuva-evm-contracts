const { ethers } = require("hardhat");

async function main() {
    const PROXY_ADDRESS = process.env.CROSS_CHAIN_MANAGER_PROXY_BASE;
    if (!PROXY_ADDRESS) {
        throw new Error("CROSS_CHAIN_MANAGER_PROXY_BASE is not set.");
    }

    // Get contract instance
    const manager = await ethers.getContractAt("CrossChainManager", PROXY_ADDRESS);

    const address = "0xDd3199E196BbF9A463500d5fB442FB7f78131F7a";
    const isExists = await manager.isDestinationExists(address);

    console.log(`Is ${address} exist in destination list: ${isExists}`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
