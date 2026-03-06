const { ethers } = require("hardhat");

async function main() {
    const PROXY_ADDRESS = process.env.VAULT_CROSS_CHAIN_PROXY_ETH;
    if (!PROXY_ADDRESS) {
        throw new Error("VAULT_CROSS_CHAIN_PROXY_ETH is not set.");
    }

    // Get contract instance
    const vault = await ethers.getContractAt("CrossChainVault", PROXY_ADDRESS);

    const address = "0xDd3199E196BbF9A463500d5fB442FB7f78131F7a";
    const isExists = await vault.isWhitelisted(address);

    console.log(`Is ${address} exist in whitelist: ${isExists}`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
