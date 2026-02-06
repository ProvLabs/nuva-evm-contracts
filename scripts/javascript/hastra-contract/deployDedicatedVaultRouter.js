const { ethers, upgrades } = require("hardhat");

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with the account:", deployer.address);

    // 1. Get Environment Variables
    const assetVaultAddr = process.env.ASSET_VAULT_ADDRESS;
    const stakingVaultAddr = process.env.STAKING_VAULT_ADDRESS;
    const amlSignerAddr = process.env.AML_ADDRESS;
    const adminAddr = process.env.ADMIN_ADDRESS || deployer.address;

    if (!assetVaultAddr || !stakingVaultAddr || !amlSignerAddr) {
        throw new Error("Missing required environment variables (ASSET_VAULT, STAKING_VAULT, or AML_SIGNER)");
    }

    // NEW: Deploy Nuva Vault
    console.log("Deploying NuvaVault (MockERC4626)...");
    const MockERC4626 = await ethers.getContractFactory("MockERC4626");
    const nuvaVault = await MockERC4626.deploy(stakingVaultAddr, "Nuva Shares", "NuvS");
    await nuvaVault.waitForDeployment();
    const nuvaVaultAddr = await nuvaVault.getAddress();
    console.log("✅ NuvaVault deployed to:", nuvaVaultAddr);

    // 2. Deploy the Proxy
    // Note: 'deployProxy' handles deploying the implementation AND the proxy for you.
    console.log("Deploying DedicatedVaultRouter Proxy...");
    const DedicatedVaultRouter = await ethers.getContractFactory("DedicatedVaultRouter");

    const router = await upgrades.deployProxy(
        DedicatedVaultRouter,
        [
            assetVaultAddr,
            stakingVaultAddr,
            nuvaVaultAddr, // NEW: Pass nuvaVaultAddr
            amlSignerAddr,
            adminAddr
        ],
        {
            initializer: "initialize",
            kind: "uups"
        }
    );

    await router.waitForDeployment();
    const proxyAddress = await router.getAddress();

    console.log("✅ DedicatedVaultRouter Proxy deployed to:", proxyAddress);

    // 3. Get Implementation Address (for verification purposes)
    const implementationAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);
    console.log("✅ Implementation contract deployed to:", implementationAddress);

    // 4. Verify code exists
    const code = await ethers.provider.getCode(proxyAddress);
    if (code === "0x") {
        throw new Error("Proxy deployment failed - no code at address.");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });