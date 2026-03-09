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
    throw new Error(
      "Missing required environment variables (ASSET_VAULT, STAKING_VAULT, or AML_SIGNER)",
    );
  }

  // NEW: Deploy Nuva Vault via Proxy
  console.log("Deploying NuvaVault Proxy...");
  const NuvaVault = await ethers.getContractFactory("NuvaVault");
  const nuvaVault = await upgrades.deployProxy(
    NuvaVault,
    [stakingVaultAddr, "Nuva Prime Vault", "nvPRIME", adminAddr],
    {
      initializer: "initialize",
      kind: "uups",
    },
  );
  await nuvaVault.waitForDeployment();
  const nuvaVaultAddr = await nuvaVault.getAddress();
  console.log("✅ NuvaVault Proxy deployed to:", nuvaVaultAddr);

  // 2. Deploy the Proxy
  // Note: 'deployProxy' handles deploying the implementation AND the proxy for you.
  console.log("Deploying DedicatedVaultRouter Proxy...");
  const DedicatedVaultRouter = await ethers.getContractFactory(
    "DedicatedVaultRouter",
  );

  const router = await upgrades.deployProxy(
    DedicatedVaultRouter,
    [
      assetVaultAddr,
      stakingVaultAddr,
      nuvaVaultAddr, // NEW: Pass nuvaVaultAddr
      amlSignerAddr,
      adminAddr,
    ],
    {
      initializer: "initialize",
      kind: "uups",
    },
  );

  await router.waitForDeployment();
  const proxyAddress = await router.getAddress();

  console.log("✅ DedicatedVaultRouter Proxy deployed to:", proxyAddress);

  // 3. Set RedemptionProxy Implementation if provided
  const redemptionImpl = process.env.REDEMPTION_PROXY_IMPLEMENTATION;
  if (redemptionImpl) {
    console.log("Setting RedemptionProxy implementation to:", redemptionImpl);
    const tx = await router.setRedemptionProxyImplementation(redemptionImpl);
    await tx.wait();
    console.log("✅ RedemptionProxy implementation set.");
  }

  // 4. Grant Keeper Role if KEEPER_ADDRESS is provided
  const keeperAddr = process.env.KEEPER_ADDRESS;
  if (keeperAddr) {
    console.log("Granting KEEPER_ROLE to:", keeperAddr);
    const KEEPER_ROLE = await router.KEEPER_ROLE();
    const tx = await router.grantRole(KEEPER_ROLE, keeperAddr);
    await tx.wait();
    console.log("✅ KEEPER_ROLE granted.");
  }

  // 4. Get Implementation Address (for verification purposes)
  const implementationAddress =
    await upgrades.erc1967.getImplementationAddress(proxyAddress);
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
