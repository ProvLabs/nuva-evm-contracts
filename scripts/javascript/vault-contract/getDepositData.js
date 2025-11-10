// scripts/fullDepositWithPermit.js
const { ethers } = require("hardhat");

// --- START: Configuration ---
const CLONE_ADDRESS = process.env.CLONE_ADDRESS;
if (!CLONE_ADDRESS) {
    throw new Error("CLONE_ADDRESS is not set.");
}

const DEPOSIT_FACTRORY_ADDR = process.env.DEPOSITOR_FACTORY_CONTRACT;
if (!DEPOSIT_FACTRORY_ADDR) {
    throw new Error("DEPOSITOR_FACTORY_CONTRACT is not set.");
}

const DEPOSIT_TOKEN_ADDRESS = process.env.TOKEN_ADDRESS;
if (!DEPOSIT_TOKEN_ADDRESS) {
    throw new Error("TOKEN_ADDRESS is not set.");
}

const SHARE_TOKEN_ADDRESS = process.env.SHARED_TOKEN_ADDRESS;
if (!SHARE_TOKEN_ADDRESS) {
    throw new Error("SHARED_TOKEN_ADDRESS is not set.");
}

const DESTINATION_ADDRESS = "0x69482E00b8Ab0a256E8eF99718CcD8a2C460C3f7"; // Wallet to receive tokens

// NOTE: Change '18' if your token has different decimals (e.g., 6 for USDC)
const TOKEN_DECIMALS = 6;
const AMOUNT_TO_DEPOSIT_STRING = "0.2"; // The amount in human-readable form
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

// --- Main Script ---
async function main() {
    // 1. Setup Signers and Contracts
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        throw new Error("PRIVATE_KEY is not set in environment variables");
    }

    // Create a wallet instance from the private key
    const amlSigner = getAmlSigner();

    console.log(`AML Signer (server): ${amlSigner.address}`);
    console.log(`Destination: ${DESTINATION_ADDRESS}`);

    // Get the Depositor contract instance
    const depositor = await ethers.getContractAt("Depositor", CLONE_ADDRESS);
    console.log("Depositor contract:", depositor.target);
    console.log("shareToken:", await depositor.shareToken());
    console.log("depositToken:", await depositor.depositToken());
    console.log("amlSigner:", await depositor.amlSigner());
    // console.log("usedSignatures:", await depositor.usedSignatures());
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
