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

  const amlSignerAddr = process.env.AML_SIGNER_KEY;
  if (!amlSignerAddr) {
    throw new Error(
      "AML_SIGNER_KEY is not set."
    );
  }
  // 5. Initialize a new Depositor instance through the factory
  const depositTokenAddress = ethers.getAddress(tokenAddr);
  const shareTokenAddress = ethers.getAddress(shareTokenAddr);
  const amlSignerAddress = ethers.getAddress(amlSignerAddr);
  
  console.log("Creating new Depositor instance...");
  const tx = await factory.createDepositor(
    depositTokenAddress,
    shareTokenAddress,
    amlSignerAddress
  );
  console.log("\nTransaction hash:", tx.hash);
  const receipt = await tx.wait();
  
  // Log all events for debugging
  console.log("\nAll events in receipt:", receipt.events?.map(e => e.event) || []);
  
  // Try to find the DepositorCreated event
  let depositorAddress;
  
  // Method 1: Try to find by event name
  let event = receipt.logs?.find(log => {
    try {
      const parsedLog = factory.interface.parseLog(log);
      return parsedLog && parsedLog.name === 'DepositorCreated';
    } catch (e) {
      return false;
    }
  });

  // If we found an event, parse it
  if (event) {
    const parsedLog = factory.interface.parseLog(event);
    depositorAddress = parsedLog.args[0]; // First argument is the depositor address
    
    console.log("✅ Found DepositorCreated event:", {
      event: parsedLog.name,
      args: parsedLog.args,
      depositorAddress: depositorAddress
    });
  } else {
    // Fallback: Try to find any event with the depositor address
    const potentialEvents = receipt.logs?.map(log => {
      try {
        return factory.interface.parseLog(log);
      } catch (e) {
        return null;
      }
    }).filter(Boolean);
    
    console.log("All parsed events:", potentialEvents);
    
    // Look for any event where the first argument is an address (potential depositor address)
    for (const e of potentialEvents) {
      if (e.args.length > 0 && ethers.isAddress(e.args[0])) {
        depositorAddress = e.args[0];
        console.log("ℹ️ Found potential depositor address in event:", {
          event: e.name,
          depositorAddress: depositorAddress,
          args: e.args
        });
        break;
      }
    }
    
    if (!depositorAddress) {
      console.error("❌ Could not find DepositorCreated event in receipt");
      console.log("Raw logs:", receipt.logs);
    }
  }
  
  if (!depositorAddress) {
    throw new Error("Failed to get depositor address from transaction receipt");
  }
  
  console.log("✅ New Depositor instance created at:", depositorAddress);
  
  // Verify the contract was deployed correctly
  const code = await ethers.provider.getCode(depositorAddress);
  if (code === '0x') {
    throw new Error("No code at the deployed address. Contract deployment may have failed.");
  }
  console.log("✅ Contract code verified at the address");
}

// Standard Hardhat script runner
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
