const { ethers } = require("hardhat");

async function main() {
  const amlUtilsAddr = process.env.AML_UTILS_CONTRACT;
  if (!amlUtilsAddr) {
    throw new Error(
      "AML_UTILS_CONTRACT is not set."
    );
  }

  // 1. Get the contract factory for the Withdrawal
  const withdrawal = await ethers.getContractFactory("Withdrawal", {
      libraries: {
        AMLUtils: amlUtilsAddr
      }
    });

  // 2. Deploy the implementation contract
  console.log("Deploying Withdrawal implementation...");
  const implementation = await withdrawal.deploy();
  await implementation.waitForDeployment();
  console.log("✅ Withdrawal implementation deployed to:", implementation.target);

  // 3. Get the contract factory for the WithdrawalFactory
  const withdrawalFactory = await ethers.getContractFactory("WithdrawalFactory");
  
  // 4. Deploy the factory contract
  console.log("Deploying WithdrawalFactory...");
  const factory = await withdrawalFactory.deploy(implementation.target);
  await factory.waitForDeployment();
  
  console.log("✅ Factory deployed to:", factory.target);
  
  const tokenAddr = process.env.TOKEN_ADDRESS;
  if (!tokenAddr) {
    throw new Error(
      "TOKEN_ADDRESS is not set."
    );
  }

  const paymentTokenAddr = process.env.SHARED_TOKEN_ADDRESS;
  if (!paymentTokenAddr) {
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
  // 5. Initialize a new Withdrawal instance through the factory
  const withdrawalTokenAddress = ethers.getAddress(tokenAddr);
  const paymentTokenAddress = ethers.getAddress(paymentTokenAddr);
  const amlSignerAddress = ethers.getAddress(amlSignerAddr);
  
  console.log("Creating new Withdrawal instance...");
  const tx = await factory.createWithdrawal(
    paymentTokenAddress,
    withdrawalTokenAddress,
    amlSignerAddress
  );
  console.log("\nTransaction hash:", tx.hash);
  const receipt = await tx.wait();
  
  // Log all events for debugging
  console.log("\nAll events in receipt:", receipt.events?.map(e => e.event) || []);
  
  // Try to find the WithdrawalCreated event
  let withdrawalAddress;
  
  // Method 1: Try to find by event name
  let event = receipt.logs?.find(log => {
    try {
      const parsedLog = factory.interface.parseLog(log);
      return parsedLog && parsedLog.name === 'WithdrawalCreated';
    } catch (e) {
      return false;
    }
  });

  // If we found an event, parse it
  if (event) {
    const parsedLog = factory.interface.parseLog(event);
    withdrawalAddress = parsedLog.args[2]; // Third argument is the withdrawal address
    
    console.log("✅ Found WithdrawalCreated event:", {
      event: parsedLog.name,
      args: parsedLog.args,
      withdrawalAddress: withdrawalAddress
    });
  } else {
    // Fallback: Try to find any event with the withdrawal address
    const potentialEvents = receipt.logs?.map(log => {
      try {
        return factory.interface.parseLog(log);
      } catch (e) {
        return null;
      }
    }).filter(Boolean);
    
    console.log("All parsed events:", potentialEvents);
    
    // Look for any event where the first argument is an address (potential withdrawal address)
    for (const e of potentialEvents) {
      if (e.args.length > 0 && ethers.isAddress(e.args[0])) {
        withdrawalAddress = e.args[0];
        console.log("ℹ️ Found potential withdrawal address in event:", {
          event: e.name,
          withdrawalAddress: withdrawalAddress,
          args: e.args
        });
        break;
      }
    }
    
    if (!withdrawalAddress) {
      console.error("❌ Could not find WithdrawalCreated event in receipt");
      console.log("Raw logs:", receipt.logs);
    }
  }
  
  if (!withdrawalAddress) {
    throw new Error("Failed to get withdrawal address from transaction receipt");
  }
  
  console.log("✅ New Withdrawal instance created at:", withdrawalAddress);
  
  // Verify the contract was deployed correctly
  const code = await ethers.provider.getCode(withdrawalAddress);
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
