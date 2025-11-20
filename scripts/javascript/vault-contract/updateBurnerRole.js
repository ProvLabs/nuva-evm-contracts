// scripts/burn.js
const { ethers } = require("hardhat");

// --- START: Configuration ---
const CLONE_ADDRESS = process.env.WITHDRAWAL_CLONE_ADDRESS;
if (!CLONE_ADDRESS) {
    throw new Error("WITHDRAWAL_CLONE_ADDRESS is not set.");
}
// --- END: Configuration ---

async function main() {
    const [burner] = await ethers.getSigners();
    console.log(`👤 Acting as Admin: ${burner.address}`);
    console.log(`🎯 Targeting Clone: ${CLONE_ADDRESS}`);

    // 1. Get contract instance
    const withdrawal = await ethers.getContractAt("Withdrawal", CLONE_ADDRESS);

    // 2. EXPLICITLY fetch the role hash first
    // We await this to ensure we have the actual bytes32 string, not a Promise object
    const BURN_ROLE_HASH = await withdrawal.BURN_ROLE();
    console.log(`🔑 BURN_ROLE Hash: ${BURN_ROLE_HASH}`);

    const addr = "0x69482E00b8Ab0a256E8eF99718CcD8a2C460C3f7";

    // 3. Check status BEFORE (Sanity Check)
    const hasRoleBefore = await withdrawal.hasRole(BURN_ROLE_HASH, addr);
    console.log(`   Status Before: ${hasRoleBefore ? "✅ Has Role" : "❌ No Role"}`);

    if (hasRoleBefore) {
        console.log("⚠️ Address already has the role. Skipping transaction.");
        return;
    }

    // 4. Grant Role
    console.log("⏳ Granting role...");
    // Pass the explicitly resolved hash (BURN_ROLE_HASH)
    const tx = await withdrawal.connect(burner).grantRole(BURN_ROLE_HASH, addr);
    console.log("   Tx sent:", tx.hash);

    await tx.wait();
    console.log("   ✅ Transaction mined!");

    // 5. VERIFY status immediately after
    // This proves if the contract storage was actually updated
    const hasRoleAfter = await withdrawal.hasRole(BURN_ROLE_HASH, addr);
    console.log(`   Status After:  ${hasRoleAfter ? "✅ Has Role" : "❌ FAILED TO UPDATE"}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
