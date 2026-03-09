const { ethers } = require("hardhat");

/**
 * @notice Script to deploy the RedemptionProxy master copy implementation.
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(
    "Deploying RedemptionProxy implementation with the account:",
    deployer.address,
  );

  const RedemptionProxy = await ethers.getContractFactory("RedemptionProxy");
  const implementation = await RedemptionProxy.deploy();

  await implementation.waitForDeployment();
  const implementationAddress = await implementation.getAddress();

  console.log(`
🚀 Success! RedemptionProxy implementation deployed to: ${implementationAddress}`);
  console.log(
    `Next step: Set this address in the DedicatedVaultRouter using updateDedicatedVaultRouter.js`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
