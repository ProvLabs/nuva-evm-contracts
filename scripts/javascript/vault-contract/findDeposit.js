// scripts/findDepositor.js
const { ethers } = require("hardhat");

// --- START: Configuration ---
const FACTORY_ADDRESS = "0x7d25B8aFB0D88B93fDB77b1E522e35fEd4184c77";
const SHARE_TOKEN_ADDRESS = "0x792949BA096871c6411634b53183A7764f2244f8";
const DEPOSIT_TOKEN_ADDRESS = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
// --- END: Configuration ---

async function main() {
    console.log(`Querying factory at: ${FACTORY_ADDRESS}`);
    console.log(`  Share Token: ${SHARE_TOKEN_ADDRESS}`);
    console.log(`  Deposit Token: ${DEPOSIT_TOKEN_ADDRESS}`);

    // 1. Get the factory contract instance
    // We don't need the full ABI, just the part Hardhat
    // can find in its artifacts.
    const factory = await ethers.getContractAt("DepositorFactory", FACTORY_ADDRESS);

    // 2. Call the 'depositors' getter function
    // This is a free, read-only call.
    const cloneAddress = await factory.depositors(SHARE_TOKEN_ADDRESS, DEPOSIT_TOKEN_ADDRESS);

    // 3. Log the result
    if (cloneAddress === ethers.ZeroAddress) {
        console.log("-----------------------------------------");
        console.log("❌ Result: No depositor clone found for this pair.");
        console.log("-----------------------------------------");
    } else {
        console.log("-----------------------------------------");
        console.log("✅ Result: Found clone address!");
        console.log(`   ${cloneAddress}`);
        console.log("-----------------------------------------");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
