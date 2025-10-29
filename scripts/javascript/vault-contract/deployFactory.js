// scripts/javascript/vault-contract/deployFactory.js

const { ethers } = require("hardhat");

async function main() {
  // 1. Get the contract factory for the implementation
  const Depositor = await ethers.getContractFactory("Depositor");

  // 2. Deploy the implementation contract
  console.log("Deploying Depositor (implementation)...");
  const implementation = await Depositor.deploy();
  await implementation.waitForDeployment();

  console.log("✅ Implementation deployed to:", implementation.target);

  // 3. Get the contract factory for the factory
  const DepositorFactory = await ethers.getContractFactory("DepositorFactory");

  // 4. Deploy the factory, passing the implementation address as a constructor argument
  console.log("Deploying DepositorFactory...");
  const factory = await DepositorFactory.deploy(
    implementation.target // Pass the address here
  );
  await factory.waitForDeployment();

  console.log("✅ Factory deployed to:", factory.target);
}

// Standard Hardhat script runner
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
