const { ethers } = require("hardhat");

async function main() {
    const deployVault = await ethers.getContractFactory("CrossChainVault");

    const wormhole = "0x4a8bc80Ed5a4067f1CCf107057b8270E0cC11A78";
    const tokenBridge = "0x2703483B1a5a7c577e8680de9Df8Be03c6f30e3c";
    const chainId = 10002;
    const wormholeFinality = 1;
    const feePrecision = 1;
    const relayerFeePercentage = 0;

    console.log("Deploying Vault (implementation)...");
    const vault = await deployVault.deploy(
        wormhole,
        tokenBridge,
        chainId,
        wormholeFinality,
        feePrecision,
        relayerFeePercentage,
    );

    console.log("✅ Vault deployed to:", vault.target);
}

// Standard Hardhat script runner
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
