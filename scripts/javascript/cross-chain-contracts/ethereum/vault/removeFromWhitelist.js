const { ethers } = require("hardhat");

async function main() {
    const PROXY_ADDRESS = process.env.VAULT_CROSS_CHAIN_PROXY_ETH;
    if (!PROXY_ADDRESS) {
        throw new Error("VAULT_CROSS_CHAIN_PROXY_ETH is not set.");
    }

    const addr = "0xDd3199E196BbF9A463500d5fB442FB7f78131F7a";

    const vault = await ethers.getContractAt("CrossChainVault", PROXY_ADDRESS);

    // Now remove the address
    console.log(`Removing ${addr} from allowlist...`);
    const tx = await vault.removeFromWhitelist(addr);
    const receipt = await tx.wait();

    console.log("   ✅ Address removed successfully! Transaction hash:", receipt.hash);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
