const { ethers } = require("hardhat");

async function main() {
    const deployVault = await ethers.getContractFactory("CrossChainVault");

    const wormhole = "0x4a8bc80Ed5a4067f1CCf107057b8270E0cC11A78";
    const tokenBridge = "0xDB5492265f6038831E89f495670FF909aDe94bd9";
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
