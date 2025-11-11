// scripts/fullDepositWithPermit.js
const { ethers } = require("hardhat");

const WITHDRAWAL_CONTRACT_ADDRESS = process.env.WITHDRAWAL_CONTRACT;
if (!WITHDRAWAL_CONTRACT_ADDRESS) {
    throw new Error(
      "WITHDRAWAL_CONTRACT is not set."
    );
}

// --- Main Script ---
async function main() {
    // Get the Withdrawal contract instance
    const withdrawal = await ethers.getContractAt("Withdrawal", WITHDRAWAL_CONTRACT_ADDRESS);
    console.log("Withdrawal contract:", withdrawal.target);
    console.log("shareToken:", await withdrawal.shareToken());
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
