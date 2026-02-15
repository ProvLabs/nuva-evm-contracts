const { ethers } = require("hardhat");

async function main() {
    const deployVault = await ethers.getContractFactory("CrossChainVaultV1");

    const executor = "0x96846c31e4f87c0f186a322926c61d4183439f0a";

    console.log("Deploying Vault (implementation)...");
    const vault = await deployVault.deploy(executor);

    console.log("✅ Vault deployed to:", vault.target);
}

// Standard Hardhat script runner
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
