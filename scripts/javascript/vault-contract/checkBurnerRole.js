// scripts/burn.js
const { ethers } = require("hardhat");

// --- START: Configuration ---
const CLONE_ADDRESS = process.env.WITHDRAWAL_CLONE_ADDRESS;
if (!CLONE_ADDRESS) {
    throw new Error("WITHDRAWAL_CLONE_ADDRESS is not set.");
}

const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS;
if (!TOKEN_ADDRESS) {
    throw new Error("TOKEN_ADDRESS is not set.");
}

// --- END: Configuration ---

async function main() {
    // 1. Get our "burner" (signer 0, the deployer/admin with BURN_ROLE)
    const [burner] = await ethers.getSigners();

    console.log(`Simulating burn as admin: ${burner.address}`);
    console.log(`Targeting clone: ${CLONE_ADDRESS}`);

    // 2. Get contract instances
    const withdrawal = await ethers.getContractAt("Withdrawal", CLONE_ADDRESS);
    const token = await ethers.getContractAt("CustomToken", TOKEN_ADDRESS);

    // 3. Check the contract's current balance
    const initialBalance = await token.balanceOf(CLONE_ADDRESS);
    console.log(`Contract's initial balance: ${ethers.formatUnits(initialBalance, 6)} tokens.`);

    // 4. Check if current signer has BURN_ROLE
    const addr = "0x69482E00b8Ab0a256E8eF99718CcD8a2C460C3f7";
    const hasBurnRole = await withdrawal.hasRole(withdrawal.BURN_ROLE(), addr);
    console.log(`Does ${addr} have BURN_ROLE? ${hasBurnRole ? "✅ Yes" : "❌ No"}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
