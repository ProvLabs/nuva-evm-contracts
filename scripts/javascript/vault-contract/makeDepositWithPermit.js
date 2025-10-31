// scripts/fullDepositWithPermit.js
const { ethers } = require("hardhat");

// --- START: Configuration ---
const CLONE_ADDRESS = "0x8aAef1A980Da6B5a26FD8ee9Ebd13c5e60055188";
const DEPOSIT_TOKEN_ADDRESS = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"; // e.g., USDC
const SHARE_TOKEN_ADDRESS = "0x792949BA096871c6411634b53183A7764f2244f8";  // e.g., SteveCoin
const DESTINATION_ADDRESS = "0xB037CDb5b9e92237657f5F6ae7c7F13e533fC539"; // Wallet to receive tokens

// NOTE: Change '18' if your token has different decimals (e.g., 6 for USDC)
const TOKEN_DECIMALS = 6;
const AMOUNT_TO_DEPOSIT_STRING = "0.2"; // The amount in human-readable form
// --- END: Configuration ---


// --- Helper: Load AML Signer ---
function getAmlSigner() {
    const amlPrivateKey = process.env.AML_SIGNER_PRIVATE_KEY;
    if (!amlPrivateKey || amlPrivateKey.length !== 66) { // 0x + 64 hex chars
        throw new Error(
            "Invalid or missing AML_SIGNER_PRIVATE_KEY in .env file. " +
            "It should be a 66-character hex string (starting with 0x)."
        );
    }
    return new ethers.Wallet(amlPrivateKey, ethers.provider);
}

// --- Main Script ---
async function main() {
    // 1. Setup Signers and Contracts
    const [_, user] = await ethers.getSigners();
    const amlSigner = getAmlSigner();

    console.log(`User (depositor): ${user.address}`);
    console.log(`AML Signer (server): ${amlSigner.address}`);
    console.log(`Destination: ${DESTINATION_ADDRESS}`);

    const depositor = await ethers.getContractAt("Depositor", CLONE_ADDRESS);
    const depositToken = await ethers.getContractAt("IFullERC20", DEPOSIT_TOKEN_ADDRESS);
    const amountToDeposit = ethers.parseUnits(AMOUNT_TO_DEPOSIT_STRING, TOKEN_DECIMALS);

    // 2. Check User Balance
    const balance = await depositToken.balanceOf(user.address);
    if (balance < amountToDeposit) {
        console.error(`❌ Error: User does not have enough tokens. Needs ${AMOUNT_TO_DEPOSIT_STRING}.`);
        console.error(`  User Balance: ${ethers.formatUnits(balance, TOKEN_DECIMALS)}`);
        return;
    }
    console.log(`User balance is: ${ethers.formatUnits(balance, TOKEN_DECIMALS)} tokens.`);

    // --- STEP 1: Generate AML Signature (Server-side) ---
    console.log("\n1. Generating AML Signature (as server)...");

    // This deadline is for the AML signature itself
    const amlDeadline = Math.floor(Date.now() / 1000) + (20 * 60); // 20 minutes

    // This hash MUST match _getMessageHash in your contract
    const amlMessageHash = ethers.solidityPackedKeccak256(
        ["address", "address", "address", "uint256", "address", "uint256"],
        [
            user.address,           // msg.sender
            DEPOSIT_TOKEN_ADDRESS,  // address(depositToken)
            SHARE_TOKEN_ADDRESS,   // shareToken
            amountToDeposit,        // _amount
            DESTINATION_ADDRESS,    // _destinationAddress
            amlDeadline             // _deadline
        ]
    );

    // Sign the hash
    // amlSigner.signMessage automatically prefixes the hash (like toEthSignedMessageHash)
    const amlSignature = await amlSigner.signMessage(ethers.getBytes(amlMessageHash));
    console.log("   ✅ AML Signature created.");

    // --- STEP 2: Generate EIP-2612 Permit Signature (User-side) ---
    console.log("\n2. Generating Permit Signature (as user)...");

    // Get the token's current nonce for the user
    const permitNonce = await depositToken.nonces(user.address);
    // This deadline is for the permit signature
    const permitDeadline = Math.floor(Date.now() / 1000) + (20 * 60); // 20 minutes
    const tokenName = await depositToken.name();
    const chainId = (await ethers.provider.getNetwork()).chainId;

    const domain = {
        name: tokenName,
        version: "2", // Note: USDC on Eth Sepolia is version 2
        chainId: chainId,
        verifyingContract: DEPOSIT_TOKEN_ADDRESS
    };

    const types = {
        Permit: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
            { name: "value", type: "uint256" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" }
        ]
    };

    const value = {
        owner: user.address,
        spender: depositor.target,
        value: amountToDeposit,
        nonce: permitNonce,
        deadline: permitDeadline
    };

    // Sign the typed data
    const permitSignature = await user.signTypedData(domain, types, value);
    const { v, r, s } = ethers.Signature.from(permitSignature);
    console.log("   ✅ Permit Signature created.");

    // --- STEP 3: Call the Contract ---
    console.log("\n3. Calling depositWithPermit() with both signatures...");

    const tx = await depositor.connect(user).depositWithPermit(
        amountToDeposit,       // _amount
        DESTINATION_ADDRESS,   // _destinationAddress
        amlSignature,          // _amlSignature
        amlDeadline,           // _amlDeadline
        permitDeadline,        // _permitDeadline
        v,                     // _v
        r,                     // _r
        s                      // _s
    );

    const receipt = await tx.wait();
    console.log("   ✅ Deposit successful! Transaction hash:", receipt.hash);

    // 4. Final Verification
    const finalBalance = await depositToken.balanceOf(DESTINATION_ADDRESS);
    console.log("-----------------------------------------");
    console.log("🎉 Verification Complete 🎉");
    console.log(`Destination wallet balance: ${ethers.formatUnits(finalBalance, TOKEN_DECIMALS)} tokens.`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
