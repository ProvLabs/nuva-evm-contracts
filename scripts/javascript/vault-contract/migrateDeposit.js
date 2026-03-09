// scripts/migrateDeposit.js
const { ethers } = require("hardhat");

// --- START: Configuration ---
// 1. PASTE YOUR FACTORY ADDRESS HERE
const FACTORY_ADDRESS = process.env.DEPOSITOR_FACTORY_CONTRACT;
if (!FACTORY_ADDRESS) {
  throw new Error("DEPOSITOR_FACTORY_CONTRACT is not set.");
}

// 2. DEFINE THE TOKEN PAIR YOU WANT TO MIGRATE
const DEPOSIT_TOKEN_ADDRESS = process.env.TOKEN_ADDRESS;
if (!DEPOSIT_TOKEN_ADDRESS) {
  throw new Error("TOKEN_ADDRESS is not set.");
}
const SHARE_TOKEN_ADDRESS = process.env.SHARE_TOKEN_ADDRESS;
if (!SHARE_TOKEN_ADDRESS) {
  throw new Error("SHARE_TOKEN_ADDRESS is not set.");
}

// 3. DEFINE THE AML SIGNER FOR THE *NEW* v2 CLONE
// (This is passed to the new clone's 'initialize' function)
const NEW_AML_SIGNER_ADDRESS = process.env.PUBLIC_KEY_1;
if (!NEW_AML_SIGNER_ADDRESS) {
  throw new Error("PUBLIC_KEY_1 is not set.");
}
// --- END: Configuration ---

const NEW_CLONE_ADDRESS = process.env.DEPOSITOR_CONTRACT;
if (!NEW_CLONE_ADDRESS) {
  throw new Error("DEPOSITOR_CONTRACT is not set.");
}

async function main() {
  // 1. Get the factory owner (the signer from your .env)
  const [owner] = await ethers.getSigners();
  if (!owner) {
    throw new Error(
      "No signer found. Check your hardhat.config.js and PRIVATE_KEY.",
    );
  }

  console.log(`Running migration as factory owner: ${owner.address}`);

  // 2. Get the factory contract
  const factory = await ethers.getContractAt(
    "DepositorFactory",
    FACTORY_ADDRESS,
  );

  // 3. --- PRE-MIGRATION CHECK ---
  console.log("Checking for existing (v1) clone...");
  const oldCloneAddress = await factory.depositors(
    SHARE_TOKEN_ADDRESS,
    DEPOSIT_TOKEN_ADDRESS,
  );

  if (oldCloneAddress === ethers.ZeroAddress) {
    throw new Error(
      "No existing depositor found for this pair. Nothing to migrate.",
    );
  }
  console.log(`   Found v1 clone at: ${oldCloneAddress}`);

  const clone_tx = await factory
    .connect(owner)
    .updateImplementation(NEW_CLONE_ADDRESS);

  // Wait for the transaction to be mined
  await clone_tx.wait();
  console.log(`   ✅ Migration transaction successful! Hash: ${clone_tx.hash}`);

  // 4. --- CALL MIGRATE FUNCTION ---
  console.log("Sending transaction to migrateDepositor()...");

  const tx = await factory
    .connect(owner)
    .migrateDepositor(
      SHARE_TOKEN_ADDRESS,
      DEPOSIT_TOKEN_ADDRESS,
      NEW_AML_SIGNER_ADDRESS,
    );

  // Wait for the transaction to be mined
  const receipt = await tx.wait();
  console.log(`   ✅ Migration transaction successful! Hash: ${tx.hash}`);

  // 5. --- POST-MIGRATION VERIFICATION ---
  console.log("Verifying migration...");

  // Parse the event log to find the new address
  let newCloneAddress = "";
  for (const log of receipt.logs) {
    if (log.address !== factory.target) {
      continue;
    }

    const parsedLog = factory.interface.parseLog(log);

    if (parsedLog && parsedLog.name === "DepositorMigrated") {
      newCloneAddress = parsedLog.args.newDepositorAddress;

      // Sanity check
      if (parsedLog.args.oldDepositorAddress !== oldCloneAddress) {
        console.warn(
          "Warning: Event 'oldDepositorAddress' does not match the one we had mapped.",
        );
      }
      break;
    }
  }

  if (newCloneAddress === "") {
    throw new Error(
      "Migration failed: Could not find 'DepositorMigrated' event in transaction logs.",
    );
  }

  // Final check: Query the map again to ensure it was updated
  const mappedAddress = await factory.depositors(
    SHARE_TOKEN_ADDRESS,
    DEPOSIT_TOKEN_ADDRESS,
  );

  if (mappedAddress !== newCloneAddress) {
    throw new Error(
      "CRITICAL ERROR: The 'depositors' map was not updated correctly!",
    );
  }

  console.log("-----------------------------------------");
  console.log("🎉 Migration Complete! 🎉");
  console.log(`   Old (v1) Clone: ${oldCloneAddress}`);
  console.log(`   New (v2) Clone: ${newCloneAddress}`);
  console.log("   The 'depositors' map is now pointing to the new v2 clone.");
  console.log("-----------------------------------------");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
