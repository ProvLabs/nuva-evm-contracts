// scripts/burn.js
const { ethers } = require("hardhat");

// --- START: Configuration ---
const CLONE_ADDRESS = "0x8aAef1A980Da6B5a26FD8ee9Ebd13c5e60055188"; // Replace with your Withdrawal clone address
const WITHDRAWAL_TOKEN_ADDRESS = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"; // The token held by the contract

// NOTE: Change '18' if your token has different decimals
const AMOUNT_TO_BURN = ethers.parseUnits("5.0", 18);
// --- END: Configuration ---

async function main() {
  // 1. Get our "burner" (signer 0, the deployer/admin with BURN_ROLE)
  const [burner] = await ethers.getSigners();

  console.log(`Simulating burn as admin: ${burner.address}`);
  console.log(`Targeting clone: ${CLONE_ADDRESS}`);

  // 2. Get contract instances
  const withdrawal = await ethers.getContractAt("Withdrawal", CLONE_ADDRESS);
  const withdrawalToken = await ethers.getContractAt("IERC20", WITHDRAWAL_TOKEN_ADDRESS);

  // 3. Check the contract's current balance
  const initialBalance = await withdrawalToken.balanceOf(CLONE_ADDRESS);
  console.log(`Contract's initial balance: ${ethers.formatUnits(initialBalance, 18)} tokens.`);

  if (initialBalance < AMOUNT_TO_BURN) {
    console.error("❌ Error: Contract does not have enough tokens to burn the specified amount.");
    console.error(`  Amount to Burn: ${ethers.formatUnits(AMOUNT_TO_BURN, 18)}`);
    return;
  }

  // --- BURN --- 
  console.log(`\n1. Calling burn() on the clone contract to burn ${ethers.formatUnits(AMOUNT_TO_BURN, 18)} tokens...`);

  // Note: We connect the 'burner' to the 'withdrawal' contract
  const burnTx = await withdrawal.connect(burner).burn(AMOUNT_TO_BURN);
  const receipt = await burnTx.wait();

  console.log("   ✅ Burn successful! Transaction hash:", receipt.hash);

  // 4. Final verification
  const finalBalance = await withdrawalToken.balanceOf(CLONE_ADDRESS);
  console.log("-----------------------------------------");
  console.log("🎉 Verification Complete 🎉");
  console.log(`Contract's final balance: ${ethers.formatUnits(finalBalance, 18)} tokens.`);

  const expectedBalance = initialBalance - AMOUNT_TO_BURN;
  console.log(`Expected final balance: ${ethers.formatUnits(expectedBalance, 18)} tokens.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
