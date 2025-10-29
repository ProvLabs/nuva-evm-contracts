// scripts/createInstance.js
const { ethers } = require("hardhat");

// --- START: Configuration ---
// 1. PASTE YOUR DEPLOYED FACTORY ADDRESS HERE
const FACTORY_ADDRESS = "0x09f759EB39599c01086B7507AFC29A1291251315";

// 2. DEFINE THE SHARE TOKEN (e.g., SteveCoin)
const SHARE_TOKEN_ADDRESS = "0x792949BA096871c6411634b53183A7764f2244f8";

// 3. DEFINE THE DEPOSIT TOKEN (e.g., USDC or DAI)
const DEPOSIT_TOKEN_ADDRESS = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
// --- END: Configuration ---

async function main() {
  console.log("Attaching to deployed factory at:", FACTORY_ADDRESS);

  const depositorFactory = await ethers.getContractAt(
    "DepositorFactory",
    FACTORY_ADDRESS
  );

  console.log("Sending transaction to createDepositor()...");
  
  const tx = await depositorFactory.createDepositor(
    SHARE_TOKEN_ADDRESS,
    DEPOSIT_TOKEN_ADDRESS
  );

  // Wait for the transaction to be mined
  const receipt = await tx.wait();

  console.log("✅ Transaction successful! Hash:", tx.hash);

  // =================================================================
  // --- START: UPDATED CODE FOR ETHERS V6 ---
  // =================================================================
  
  let cloneAddress = "";

  // Loop through the raw logs in the receipt
  for (const log of receipt.logs) {
    
    // We only care about logs from our factory contract
    if (log.address.toLowerCase() !== depositorFactory.target.toLowerCase()) {
      continue;
    }

    // `parseLog` returns the parsed event, or `null` if the log
    // topic doesn't match any event in the factory's ABI
    const parsedLog = depositorFactory.interface.parseLog(log);

    if (parsedLog && parsedLog.name === "DepositorCreated") {
      cloneAddress = parsedLog.args.depositorAddress;
      
      console.log("-----------------------------------------");
      console.log("🎉 New Depositor Clone Created! 🎉");
      console.log("   Share Token:", parsedLog.args.shareToken);
      console.log("   Deposit Token:", parsedLog.args.depositToken);
      console.log("   Clone Address:", cloneAddress);
      console.log("-----------------------------------------");
      break; // Stop looping once we find it
    }
  }

  if (cloneAddress === "") {
    console.error("Could not find 'DepositorCreated' event in transaction logs.");
  }
  
  // =================================================================
  // --- END: UPDATED CODE ---
  // =================================================================
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
