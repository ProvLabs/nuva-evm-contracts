// scripts/burn.js
const { ethers } = require("hardhat");

// --- START: Configuration ---
const CLONE_ADDRESS = process.env.WITHDRAWAL_CLONE_ADDRESS;
if (!CLONE_ADDRESS) {
    throw new Error("WITHDRAWAL_CLONE_ADDRESS is not set.");
}

const SHARE_TOKEN_ADDRESS = process.env.SHARE_TOKEN_ADDRESS;
if (!SHARE_TOKEN_ADDRESS) {
    throw new Error("SHARE_TOKEN_ADDRESS is not set.");
}

// --- END: Configuration ---

async function main() {
    // 1. Get our "burner" (signer 0, the deployer/admin with BURN_ROLE)
    const [burner] = await ethers.getSigners();

    console.log(`Simulating burn as admin: ${burner.address}`);
    console.log(`Targeting clone: ${CLONE_ADDRESS}`);

    // 2. Get contract instances
    const withdrawal = await ethers.getContractAt("Withdrawal", CLONE_ADDRESS);
    const shareToken = await ethers.getContractAt("IERC20", SHARE_TOKEN_ADDRESS);

    // 3. Check the contract's current balance
    const initialBalance = await shareToken.balanceOf(CLONE_ADDRESS);
    console.log(`Contract's initial balance: ${ethers.formatUnits(initialBalance, 6)} tokens.`);

    // 4. Check if current signer has BURN_ROLE
    const addr = "0xDd3199E196BbF9A463500d5fB442FB7f78131F7a";
    const hasBurnRole = await withdrawal.hasRole(withdrawal.BURN_ROLE(), addr);
    console.log(`Does ${addr} have BURN_ROLE? ${hasBurnRole ? "✅ Yes" : "❌ No"}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
