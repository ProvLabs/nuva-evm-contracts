// scripts/makeDeposit.js
const { ethers } = require("hardhat");

// --- START: Configuration ---
const CLONE_ADDRESS = "0x590A7adE03Abd70DA77FC8c88C381d0722B31Db3";
const DEPOSIT_TOKEN_ADDRESS = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";

// NOTE: Change '6' if your token has different decimals (e.g., 6 for USDC)
const AMOUNT_TO_DEPOSIT = ethers.parseUnits("0.1", 6);
// --- END: Configuration ---

async function main() {
  // 1. Get our "user" (signer 1)
  const [_, user] = await ethers.getSigners();
  const destinationAddress = "0x0627d979A81ee7d6EEdDDD201A39EEAc63379073";

  console.log(`Simulating deposit as user: ${user.address}`);
  console.log(`Sending tokens to destination: ${destinationAddress}`);

  // 2. Get contract instances
  // We need the "Depositor" ABI to talk to the clone
  const depositor = await ethers.getContractAt("Depositor", CLONE_ADDRESS);

  // We need the "IERC20" ABI to talk to the token
  const depositToken = await ethers.getContractAt("IERC20", DEPOSIT_TOKEN_ADDRESS);

  // 3. Check if the user has enough tokens
  const balance = await depositToken.balanceOf(user.address);
  if (balance < AMOUNT_TO_DEPOSIT) {
    console.error("❌ Error: User does not have enough tokens.");
    console.error(`  User Balance: ${ethers.formatUnits(balance, 6)}`);
    console.error(`  Amount to Deposit: ${ethers.formatUnits(AMOUNT_TO_DEPOSIT, 6)}`);
    console.log("Please get tokens from a faucet before running again.");
    return;
  }
  console.log(`User balance is: ${ethers.formatUnits(balance, 6)} tokens. Proceeding...`);

  // --- STEP 1: APPROVE ---
  // The user approves the clone contract to spend their tokens
  console.log(`1. Approving clone (${depositor.target}) to spend ${ethers.formatUnits(AMOUNT_TO_DEPOSIT, 6)} tokens...`);

  // Note: We connect the `user` to the `depositToken` contract
  const approveTx = await depositToken.connect(user).approve(depositor.target, AMOUNT_TO_DEPOSIT);
  await approveTx.wait();

  console.log("   ✅ Approval successful.");

  // --- STEP 2: DEPOSIT ---
  // The user calls the deposit function on the clone
  console.log("2. Calling deposit() on the clone contract...");

  // Note: We connect the `user` to the `depositor` contract
  const depositTx = await depositor.connect(user).deposit(
    AMOUNT_TO_DEPOSIT,
    destinationAddress
  );
  const receipt = await depositTx.wait();

  console.log("   ✅ Deposit successful! Transaction hash:", receipt.hash);

  // 4. Final verification
  const finalBalance = await depositToken.balanceOf(destinationAddress);
  console.log("-----------------------------------------");
  console.log("🎉 Verification Complete 🎉");
  console.log(`Destination wallet balance: ${ethers.formatUnits(finalBalance, 6)} tokens.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
