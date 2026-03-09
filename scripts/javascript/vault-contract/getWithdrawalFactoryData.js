// scripts/fullDepositWithPermit.js
const { ethers } = require("hardhat");

// --- START: Configuration ---
const WITHDRAWAL_FACTORY_ADDRESS = process.env.WITHDRAWAL_FACTORY_CONTRACT;
if (!WITHDRAWAL_FACTORY_ADDRESS) {
  throw new Error("WITHDRAWAL_FACTORY_CONTRACT is not set.");
}

const SHARE_TOKEN_ADDRESS = process.env.SHARE_TOKEN_ADDRESS;
if (!SHARE_TOKEN_ADDRESS) {
  throw new Error("SHARE_TOKEN_ADDRESS is not set.");
}

const PAYMENT_TOKEN_ADDRESS = process.env.TOKEN_ADDRESS;
if (!PAYMENT_TOKEN_ADDRESS) {
  throw new Error("TOKEN_ADDRESS is not set.");
}

// --- END: Configuration ---

// --- Helper: Load AML Signer ---
function getAmlSigner() {
  const amlPrivateKey = process.env.AML_SIGNER_KEY;
  if (!amlPrivateKey || amlPrivateKey.length !== 66) {
    // 0x + 64 hex chars
    throw new Error(
      "Invalid or missing AML_SIGNER_KEY in .env file. " +
        "It should be a 66-character hex string (starting with 0x).",
    );
  }
  return new ethers.Wallet(amlPrivateKey, ethers.provider);
}

// --- Main Script ---
async function main() {
  // Get the Withdrawal contract instance
  const withdrawal = await ethers.getContractAt(
    "WithdrawalFactory",
    WITHDRAWAL_FACTORY_ADDRESS,
  );
  console.log("Withdrawal contract:", withdrawal.target);
  console.log("impl:", await withdrawal.implementation());

  const sharedTokenAddress = SHARE_TOKEN_ADDRESS;
  const paymentTokenAddress = PAYMENT_TOKEN_ADDRESS;
  console.log(
    "Withdrawal address:",
    await withdrawal.withdrawals(paymentTokenAddress, sharedTokenAddress),
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
