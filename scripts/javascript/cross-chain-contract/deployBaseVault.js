const { ethers } = require("hardhat");

async function main() {
    const deployVault = await ethers.getContractFactory("CrossChainVault");

    const wormhole = "0x79A1027a6A159502049F10906D333EC57E95F083";
    const tokenBridge = "0x86F55A04690fd7815A3D802bD587e83eA888B239";
    const chainId = 10004;
    const wormholeFinality = 1;
    const feePrecision = 6;
    const relayerFeePercentage = 1000000; // 0.100000

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
