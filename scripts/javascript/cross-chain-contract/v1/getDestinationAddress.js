const { ethers } = require("hardhat");

async function main() {
    const PROXY_ADDRESS = process.env.CROSS_CHAIN_MANAGER_PROXY;
    if (!PROXY_ADDRESS) {
        throw new Error("CROSS_CHAIN_MANAGER_PROXY is not set.");
    }

    // Get contract instance
    const manager = await ethers.getContractAt("CrossChainManager", PROXY_ADDRESS);

    console.log("Fetching destination addresses...");
    const destinations = await manager.getDestinationAddresses();

    if (destinations.length === 0) {
        console.log("No destination addresses found.");
    } else {
        console.log("Current Destinations:");
        destinations.forEach((addr, i) => console.log(`${i + 1}: ${addr}`));
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
