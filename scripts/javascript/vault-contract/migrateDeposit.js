// scripts/migrateDeposit.js
const { ethers } = require("hardhat");

// --- START: Configuration ---
// 1. PASTE YOUR FACTORY ADDRESS HERE
const FACTORY_ADDRESS = "0x7d25B8aFB0D88B93fDB77b1E522e35fEd4184c77";

// 2. DEFINE THE TOKEN PAIR YOU WANT TO MIGRATE
const DEPOSIT_TOKEN_ADDRESS = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"; // e.g., USDC
const SHARE_TOKEN_ADDRESS = "0x792949BA096871c6411634b53183A7764f2244f8"; // e.g., SteveCoin

// 3. DEFINE THE AML SIGNER FOR THE *NEW* v2 CLONE
// (This is passed to the new clone's 'initialize' function)
const NEW_AML_SIGNER_ADDRESS = "0x4A9C27513533b9Bd30498d22e644AC214dE9f3FE";
// --- END: Configuration ---

const NEW_CLONE_ADDRESS = "0xB9f260a95242528c384c0C7810D6E7D2d3966351";

async function main() {
    // 1. Get the factory owner (the signer from your .env)
    const [owner] = await ethers.getSigners();
    if (!owner) {
        throw new Error("No signer found. Check your hardhat.config.js and PRIVATE_KEY.");
    }

    console.log(`Running migration as factory owner: ${owner.address}`);

    // 2. Get the factory contract
    const factory = await ethers.getContractAt("DepositorFactory", FACTORY_ADDRESS);

    // 3. --- PRE-MIGRATION CHECK ---
    console.log("Checking for existing (v1) clone...");
    const oldCloneAddress = await factory.depositors(SHARE_TOKEN_ADDRESS, DEPOSIT_TOKEN_ADDRESS);

    if (oldCloneAddress === ethers.ZeroAddress) {
        throw new Error("No existing depositor found for this pair. Nothing to migrate.");
    }
    console.log(`   Found v1 clone at: ${oldCloneAddress}`);

    const clone_tx = await factory.connect(owner).updateImplementation(NEW_CLONE_ADDRESS);

    // Wait for the transaction to be mined
    await clone_tx.wait();
    console.log(`   ✅ Migration transaction successful! Hash: ${clone_tx.hash}`);

    // 4. --- CALL MIGRATE FUNCTION ---
    console.log("Sending transaction to migrateDepositor()...");

    const tx = await factory
        .connect(owner)
        .migrateDepositor(SHARE_TOKEN_ADDRESS, DEPOSIT_TOKEN_ADDRESS, NEW_AML_SIGNER_ADDRESS);

    // Wait for the transaction to be mined
    const receipt = await tx.wait();
    console.log(`   ✅ Migration transaction successful! Hash: ${tx.hash}`);

    // 5. --- POST-MIGRATION VERIFICATION ---
    console.log("Verifying migration...");

    // Parse the event log to find the new address
    let newCloneAddress = "";
    for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== factory.target.toLowerCase()) {
            continue;
        }

        const parsedLog = factory.interface.parseLog(log);

        if (parsedLog && parsedLog.name === "DepositorMigrated") {
            newCloneAddress = parsedLog.args.newDepositorAddress;

            // Sanity check
            if (parsedLog.args.oldDepositorAddress.toLowerCase() !== oldCloneAddress.toLowerCase()) {
                console.warn("Warning: Event 'oldDepositorAddress' does not match the one we had mapped.");
            }
            break;
        }
    }

    if (newCloneAddress === "") {
        throw new Error("Migration failed: Could not find 'DepositorMigrated' event in transaction logs.");
    }

    // Final check: Query the map again to ensure it was updated
    const mappedAddress = await factory.depositors(SHARE_TOKEN_ADDRESS, DEPOSIT_TOKEN_ADDRESS);

    if (mappedAddress.toLowerCase() !== newCloneAddress.toLowerCase()) {
        throw new Error("CRITICAL ERROR: The 'depositors' map was not updated correctly!");
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
