const { ethers } = require("hardhat");

async function main() {
    const PROXY_ADDRESS = process.env.VAULT_CROSS_CHAIN_PROXY_BASE;
    if (!PROXY_ADDRESS) {
        throw new Error("VAULT_CROSS_CHAIN_PROXY_BASE is not set.");
    }

    // Get contract instance
    const vault = await ethers.getContractAt("CrossChainVault", PROXY_ADDRESS);

    console.log("Fetching whitelist addresses...");
    const whitelist = await vault.getWhitelist();

    if (whitelist.length === 0) {
        console.log("No whitelist addresses found.");
    } else {
        console.log("Current whitelist:");
        whitelist.forEach((addr, i) => console.log(`${i + 1}: ${addr}`));
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
