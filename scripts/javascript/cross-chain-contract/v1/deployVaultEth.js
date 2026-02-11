const { ethers } = require("hardhat");

async function main() {
    const deployVault = await ethers.getContractFactory("CrossChainVaultV1");

    const executor = "0x2fcc7b2332d924764f17f1cf5eda1cd4b36751a2";

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
