// scripts/fullDepositWithPermit.js
const { ethers } = require("hardhat");

const WITHDRAWAL_CLONE_ADDRESS = process.env.WITHDRAWAL_CLONE_ADDRESS;
if (!WITHDRAWAL_CLONE_ADDRESS) {
    throw new Error(
      "WITHDRAWAL_CLONE_ADDRESS is not set."
    );
}

// --- Main Script ---
async function main() {
    // Get the Withdrawal contract instance
    const withdrawal = await ethers.getContractAt("Withdrawal", WITHDRAWAL_CLONE_ADDRESS);
    console.log("Withdrawal contract:", withdrawal.target);
    console.log("paymentToken:", await withdrawal.paymentToken());
    console.log("withdrawalToken:", await withdrawal.withdrawalToken());
    console.log("amlSigner:", await withdrawal.amlSigner());
    // console.log("usedSignatures:", await withdrawal.usedSignatures());
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
