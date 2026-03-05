const { ethers } = require("hardhat");

// --- START: Configuration ---
const CLONE_ADDRESS = process.env.DEPOSITOR_CLONE_ADDRESS;
if (!CLONE_ADDRESS) {
    throw new Error("DEPOSITOR_CLONE_ADDRESS is not set.");
}

const DEPOSIT_TOKEN_ADDRESS = process.env.TOKEN_ADDRESS;
if (!DEPOSIT_TOKEN_ADDRESS) {
    throw new Error("TOKEN_ADDRESS is not set.");
}

const SHARE_TOKEN_ADDRESS = process.env.SHARE_TOKEN_ADDRESS;
if (!SHARE_TOKEN_ADDRESS) {
    throw new Error("SHARE_TOKEN_ADDRESS is not set.");
}

// Wallet to receive tokens
const DESTINATION_ADDRESS = process.env.PUBLIC_KEY_1;
if (!DESTINATION_ADDRESS) {
    throw new Error("PUBLIC_KEY_1 is not set.");
}

// NOTE: Change '6' if your token has different decimals (e.g., 6 for USDC)
const AMOUNT_TO_DEPOSIT = ethers.parseUnits("0.15", 6);
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
    // 1. Get our "user" (signer 1)
    const [user] = await ethers.getSigners();
    const amlSigner = getAmlSigner();

    console.log(`Simulating deposit as user: ${user.address}`);
    console.log(`AML Signer (server): ${amlSigner.address}`);
    console.log(`Sending tokens to destination: ${DESTINATION_ADDRESS}`);

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

    // --- STEP 1: Generate AML Signature (Server-side) ---
    console.log("\n1. Generating AML Signature (as server)...");

    // This deadline is for the AML signature itself
    const amlDeadline = Math.floor(Date.now() / 1000) + 20 * 60; // 20 minutes

    // This hash MUST match _getMessageHash in your contract
    const amlMessageHash = ethers.solidityPackedKeccak256(
        ["address", "address", "address", "uint256", "address", "uint256"],
        [
            user.address, // msg.sender
            DEPOSIT_TOKEN_ADDRESS, // address(depositToken)
            SHARE_TOKEN_ADDRESS, // shareToken
            AMOUNT_TO_DEPOSIT, // _amount
            DESTINATION_ADDRESS, // _destinationAddress
            amlDeadline, // _deadline
        ],
    );

    // Sign the hash
    // amlSigner.signMessage automatically prefixes the hash (like toEthSignedMessageHash)
    const amlSignature = await amlSigner.signMessage(ethers.getBytes(amlMessageHash));
    console.log("   ✅ AML Signature created.");

    // --- STEP 1: APPROVE ---
    // The user approves the clone contract to spend their tokens
    console.log(
        `1. Approving clone (${depositor.target}) to spend ${ethers.formatUnits(AMOUNT_TO_DEPOSIT, 6)} tokens...`,
    );

    // Note: We connect the `user` to the `depositToken` contract
    const approveTx = await depositToken.connect(user).approve(depositor.target, AMOUNT_TO_DEPOSIT);
    await approveTx.wait();

    console.log("   ✅ Approval successful.");

    // --- STEP 2: DEPOSIT ---
    // The user calls the deposit function on the clone
    console.log("2. Calling deposit() on the clone contract...");

    // Note: We connect the `user` to the `depositor` contract
    const depositTx = await depositor
        .connect(user)
        .deposit(AMOUNT_TO_DEPOSIT, DESTINATION_ADDRESS, amlSignature, amlDeadline);
    const receipt = await depositTx.wait();

    console.log("   ✅ Deposit successful! Transaction hash:", receipt.hash);

    // 4. Final verification
    const finalBalance = await depositToken.balanceOf(DESTINATION_ADDRESS);
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
