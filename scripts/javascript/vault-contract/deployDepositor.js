const { ethers } = require("hardhat");

async function main() {
  const amlUtilsAddr = process.env.AML_UTILS_CONTRACT;
  if (!amlUtilsAddr) {
    throw new Error(
      "AML_UTILS_CONTRACT is not set."
    );
  }

  // 1. Get the contract factory for the Depositor
  const Depositor = await ethers.getContractFactory("Depositor", {
      libraries: {
        AMLUtils: amlUtilsAddr
      }
    });

  // 2. Deploy the implementation contract
  console.log("Deploying Depositor implementation...");
  const implementation = await Depositor.deploy();
  await implementation.waitForDeployment();
  console.log("✅ Depositor implementation deployed to:", implementation.target);

  // 3. Get the contract factory for the DepositorFactory
  const DepositorFactory = await ethers.getContractFactory("DepositorFactory");
  
  // 4. Deploy the factory contract
  console.log("Deploying DepositorFactory...");
  const factory = await DepositorFactory.deploy(implementation.target);
  await factory.waitForDeployment();
  
  console.log("✅ Factory deployed to:", factory.target);
  
  const tokenAddr = process.env.TOKEN_ADDRESS;
  if (!tokenAddr) {
    throw new Error(
      "TOKEN_ADDRESS is not set."
    );
  }

  const shareTokenAddr = process.env.SHARED_TOKEN_ADDRESS;
  if (!shareTokenAddr) {
    throw new Error(
      "SHARED_TOKEN_ADDRESS is not set."
    );
  }

  const amlSignerAddr = process.env.PUBLIC_KEY;
  if (!amlSignerAddr) {
    throw new Error(
      "PUBLIC_KEY is not set."
    );
  }
  // 5. Initialize a new Depositor instance through the factory
  const depositTokenAddress = tokenAddr;
  const shareTokenAddress = shareTokenAddr;
  const amlSignerAddress = amlSignerAddr;
  
  console.log("Creating new Depositor instance...");
  const tx = await factory.createDepositor(
    depositTokenAddress,
    shareTokenAddress,
    amlSignerAddress
  );
  const receipt = await tx.wait();
  
  // Get the address of the newly created Depositor
  const event = receipt.events?.find((e) => e.event === "DepositorCreated");
  const depositorAddress = event?.args?.depositorAddress;
  console.log("✅ New Depositor instance created at:", depositorAddress);
}

// Standard Hardhat script runner
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
