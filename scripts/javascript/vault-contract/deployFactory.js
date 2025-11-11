// scripts/javascript/vault-contract/deployFactory.js

const { ethers } = require("hardhat");

async function main() {
  // 1. Get the contract factory for the implementation
  const amlUtilsAddr = process.env.AML_UTILS_CONTRACT;
  if (!amlUtilsAddr) {
    throw new Error(
      "AML_UTILS_CONTRACT is not set."
    );
  }

  const depositor = await ethers.getContractFactory("Depositor", {
      libraries: {
        AMLUtils: amlUtilsAddr
      }
    });

  // 2. Deploy the implementation contract
  console.log("Deploying Depositor (implementation)...");
  const implementation = await depositor.deploy();
  await implementation.waitForDeployment();

  console.log("✅ Implementation deployed to:", implementation.target);

  // 3. Get the contract factory for the factory
  const depositorFactory = await ethers.getContractFactory("DepositorFactory");

  // 4. Deploy the factory, passing the implementation address as a constructor argument
  console.log("Deploying DepositorFactory...");
  const factory = await depositorFactory.deploy(
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
