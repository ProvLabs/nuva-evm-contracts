// scripts/fullDepositWithPermit.js
const { ethers } = require("hardhat");

// --- START: Configuration ---
const DEPOSITOR_FACTORY_ADDRESS = process.env.DEPOSITOR_FACTORY_CONTRACT;
if (!DEPOSITOR_FACTORY_ADDRESS) {
    throw new Error(
      "DEPOSITOR_FACTORY_CONTRACT is not set."
    );
}

const DEPOSIT_TOKEN_ADDRESS = process.env.TOKEN_ADDRESS;
if (!DEPOSIT_TOKEN_ADDRESS) {
    throw new Error(
      "TOKEN_ADDRESS is not set."
    );
}

const SHARE_TOKEN_ADDRESS = process.env.SHARED_TOKEN_ADDRESS;
if (!SHARE_TOKEN_ADDRESS) {
    throw new Error(
      "SHARED_TOKEN_ADDRESS is not set."
    );
}

const DESTINATION_ADDRESS = "0x69482E00b8Ab0a256E8eF99718CcD8a2C460C3f7"; // Wallet to receive tokens

// NOTE: Change '18' if your token has different decimals (e.g., 6 for USDC)
const TOKEN_DECIMALS = 6;
const AMOUNT_TO_DEPOSIT_STRING = "0.2"; // The amount in human-readable form
// --- END: Configuration ---


// --- Helper: Load AML Signer ---
function getAmlSigner() {
    const amlPrivateKey = process.env.AML_SIGNER_KEY;
    if (!amlPrivateKey || amlPrivateKey.length !== 66) { // 0x + 64 hex chars
        throw new Error(
            "Invalid or missing AML_SIGNER_KEY in .env file. " +
            "It should be a 66-character hex string (starting with 0x)."
        );
    }
    return new ethers.Wallet(amlPrivateKey, ethers.provider);
}

// --- Main Script ---
async function main() {
    // Get the Depositor contract instance
    const depositor = await ethers.getContractAt("DepositorFactory", DEPOSITOR_FACTORY_ADDRESS);
    console.log("Depositor contract:", depositor.target);   
    console.log("impl:", await depositor.implementation());
    
    // const shareToken = SHARE_TOKEN_ADDRESS; 
    // const depositToken = DEPOSIT_TOKEN_ADDRESS; 
    // console.log("Depositor address:", await depositor.depositors(shareToken, depositToken));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
