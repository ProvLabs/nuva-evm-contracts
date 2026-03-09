const { ethers, upgrades } = require("hardhat");

async function main() {
  const CrossChainVault = await ethers.getContractFactory("CrossChainVault");
  const executor = "0x2fcc7b2332d924764f17f1cf5eda1cd4b36751a2";

  console.log("Deploying Vault...");

  // 1. Deploy the Proxy
  const proxy = await upgrades.deployProxy(CrossChainVault, [executor], {
    initializer: "initialize",
    kind: "uups",
  });

  await proxy.waitForDeployment();
  const proxyAddress = await proxy.getAddress();
  console.log(`Proxy deployed to: ${proxyAddress}`);

  // 2. Short delay to allow nodes to sync
  console.log("Waiting for network sync...");
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // 3. Check if the address actually has code
  const code = await ethers.provider.getCode(proxyAddress);
  if (code === "0x") {
    throw new Error("Deployment failed: No bytecode found at proxy address.");
  }

  // 4. Get Implementation
  const implementationAddress =
    await upgrades.erc1967.getImplementationAddress(proxyAddress);

  console.log("----------------------------------------------");
  console.log(`Success!`);
  console.log(`Proxy: ${proxyAddress}`);
  console.log(`Logic: ${implementationAddress}`);
  console.log("----------------------------------------------");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
