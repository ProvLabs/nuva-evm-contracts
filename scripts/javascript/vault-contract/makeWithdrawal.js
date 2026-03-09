// scripts/makeWithdrawal.js
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

const PAYMENT_TOKEN_ADDRESS = process.env.TOKEN_ADDRESS;
if (!PAYMENT_TOKEN_ADDRESS) {
  throw new Error("TOKEN_ADDRESS is not set.");
}

// NOTE: Change '18' if your token has different decimals
const AMOUNT_TO_WITHDRAW = ethers.parseUnits("10.0", 18);
// --- END: Configuration ---

// --- Helper: Load AML Signer ---
function getAmlSigner() {
  const amlPrivateKey = process.env.AML_PRIVATE_KEY;
  if (!amlPrivateKey || amlPrivateKey.length !== 66) {
    // 0x + 64 hex chars
    throw new Error(
      "Invalid or missing AML_PRIVATE_KEY in .env file. " +
        "It should be a 66-character hex string (starting with 0x).",
    );
  }
  return new ethers.Wallet(amlPrivateKey, ethers.provider);
}

async function main() {
  // 1. Get our "user" (signer 1) and the AML signer
  const [user] = await ethers.getSigners();
  const amlSigner = getAmlSigner();

  console.log(`Simulating withdrawal as user: ${user.address}`);
  console.log(`AML Signer (server): ${amlSigner.address}`);
  console.log(`Withdrawing from clone: ${CLONE_ADDRESS}`);

  // 2. Get contract instances
  const withdrawal = await ethers.getContractAt("Withdrawal", CLONE_ADDRESS);
  const shareToken = await ethers.getContractAt("IERC20", SHARE_TOKEN_ADDRESS);

  // 3. Check if the user has enough tokens to withdraw
  const balance = await shareToken.balanceOf(user.address);
  if (balance < AMOUNT_TO_WITHDRAW) {
    console.error("❌ Error: User does not have enough tokens to withdraw.");
    console.error(`  User Balance: ${ethers.formatUnits(balance, 18)}`);
    console.error(
      `  Amount to Withdraw: ${ethers.formatUnits(AMOUNT_TO_WITHDRAW, 18)}`,
    );
    return;
  }
  console.log(
    `User balance is: ${ethers.formatUnits(balance, 18)} tokens. Proceeding...`,
  );

  // --- STEP 1: Generate AML Signature (Server-side) ---
  console.log("\n1. Generating AML Signature (as server)...");

  const amlDeadline = Math.floor(Date.now() / 1000) + 20 * 60; // 20 minutes

  // This hash MUST match _getMessageHash in your Withdrawal.sol contract
  const amlMessageHash = ethers.solidityPackedKeccak256(
    ["address", "address", "address", "uint256", "address", "uint256"],
    [
      user.address, // msg.sender
      SHARE_TOKEN_ADDRESS, // address(shareToken)
      PAYMENT_TOKEN_ADDRESS, // paymentToken
      AMOUNT_TO_WITHDRAW, // _amount
      CLONE_ADDRESS, // _destinationAddress (the contract itself)
      amlDeadline, // _deadline
    ],
  );

  const amlSignature = await amlSigner.signMessage(
    ethers.getBytes(amlMessageHash),
  );
  console.log("   ✅ AML Signature created.");

  // --- STEP 2: APPROVE ---
  console.log(
    `\n2. Approving clone (${withdrawal.target}) to spend ${ethers.formatUnits(AMOUNT_TO_WITHDRAW, 18)} tokens...`,
  );

  const approveTx = await shareToken
    .connect(user)
    .approve(withdrawal.target, AMOUNT_TO_WITHDRAW);
  await approveTx.wait();

  console.log("   ✅ Approval successful.");

  // --- STEP 3: WITHDRAW ---
  console.log("\n3. Calling withdraw() on the clone contract...");

  const withdrawTx = await withdrawal
    .connect(user)
    .withdraw(AMOUNT_TO_WITHDRAW, amlSignature, amlDeadline);
  const receipt = await withdrawTx.wait();

  console.log("   ✅ Withdrawal successful! Transaction hash:", receipt.hash);

  // 4. Final verification
  const finalContractBalance = await shareToken.balanceOf(CLONE_ADDRESS);
  console.log("-----------------------------------------");
  console.log("🎉 Verification Complete 🎉");
  console.log(
    `Contract's final token balance: ${ethers.formatUnits(finalContractBalance, 18)} tokens.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
