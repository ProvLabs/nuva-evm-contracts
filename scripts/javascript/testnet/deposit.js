const { GcpKmsSigner } = require("@cuonghx.gu-tech/ethers-gcp-kms-signer");
const { ethers } = require("hardhat");

// --- START: Configuration & Argument Parsing ---

// 1. Internal Mapping of Targets to Addresses
const CLONE_MAPPING = {
    "nvylds": "0x0D27b419Cce1c29b9d430345298410df05Cd8751",
    "nvheloc": "0xF6eCEb71dE111345d0D3Ca76D322209B41eB0e3F",
    "snuva": "0x0b3EDc2fD5D6c025E04f9103AF9Fb095b7EaE623"
};

// Helper to grab arguments from CLI flags OR Environment Variables
function getArg(flag, envVar) {
    // Priority 1: Check Command Line Flag
    const index = process.argv.indexOf(flag);
    if (index > -1 && index + 1 < process.argv.length) {
        return process.argv[index + 1];
    }
    // Priority 2: Check Environment Variable
    if (process.env[envVar]) {
        return process.env[envVar];
    }
    return null;
}

// 2. Retrieve Arguments (Flag name, Env Var name)
const TARGET_KEY = getArg("--target", "TARGET");
const AMOUNT_TO_DEPOSIT_STRING = getArg("--amount", "AMOUNT");

// 3. Validate Arguments
if (!TARGET_KEY || !AMOUNT_TO_DEPOSIT_STRING) {
    console.error("\n❌ Error: Missing required command line arguments.");
    console.error("Usage: npx hardhat run script.js -- --target <NAME> --amount <AMOUNT>");
    console.error(`Valid targets: ${Object.keys(CLONE_MAPPING).join(", ")}`);
    console.error("Example: npx hardhat run script.js -- --target nvylds --amount 0.222\n");
    process.exit(1);
}

// 4. Resolve Address from Map
const CLONE_ADDRESS = CLONE_MAPPING[TARGET_KEY];

if (!CLONE_ADDRESS) {
    console.error(`\n❌ Error: Unknown target '${TARGET_KEY}'.`);
    console.error(`Please use one of the following: ${Object.keys(CLONE_MAPPING).join(", ")}\n`);
    process.exit(1);
}

const DEPOSIT_TOKEN_ADDRESS = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
const DESTINATION_ADDRESS = "0xD6084C316d8c43f9695517B0961a9bDb6A1E2294";
const TOKEN_DECIMALS = 6;
// --- END: Configuration ---

const kmsConfig = {
    projectId: "provlabs-test",
    locationId: "us-central1",
    keyRingId: "nuva-key-ring",
    keyId: "nuva-app-ethereum-signing",
    versionId: "1",
};

const amlSigner = new GcpKmsSigner(kmsConfig);

// 2. Manual EIP-712 Signing using Google KMS
async function getAMLSignature({ contract, user, amount, deadline }) {
    const chainId = (await ethers.provider.getNetwork()).chainId;

    const domain = {
        name: "Depositor",
        version: "1",
        chainId: chainId,
        verifyingContract: await contract.getAddress(),
    };

    const types = {
        Deposit: [
            { name: "sender", type: "address" },
            { name: "amount", type: "uint256" },
            { name: "destinationAddress", type: "address" },
            { name: "deadline", type: "uint256" },
        ],
    };

    const value = {
        sender: user,
        amount: amount,
        destinationAddress: DESTINATION_ADDRESS,
        deadline: deadline,
    };

    console.log("Signing EIP-712 with KMS Library...");
    const signature = await amlSigner.signTypedData(domain, types, value);
    return signature;
}

// --- Main Script ---
async function main() {
    // 0. Configuration Log
    console.log("-----------------------------------------");
    console.log("🚀 Starting Deposit Script");
    console.log(`Target Name:    ${TARGET_KEY}`);
    console.log(`Target Address: ${CLONE_ADDRESS}`);
    console.log(`Deposit Amount: ${AMOUNT_TO_DEPOSIT_STRING}`);
    console.log("-----------------------------------------\n");

    // 1. Setup Signers and Contracts
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        throw new Error("PRIVATE_KEY is not set.");
    }

    const user = new ethers.Wallet(privateKey, ethers.provider);

    console.log(`User (depositor): ${user.address}`);
    console.log(`AML Signer (server): ${await amlSigner.getAddress()}`);
    console.log(`Destination: ${DESTINATION_ADDRESS}`);

    const depositor = await ethers.getContractAt("Depositor", CLONE_ADDRESS);
    const depositToken = await ethers.getContractAt("IFullERC20", DEPOSIT_TOKEN_ADDRESS);
    const amountToDeposit = ethers.parseUnits(AMOUNT_TO_DEPOSIT_STRING, TOKEN_DECIMALS);

    // 2. Check User Balance
    const balance = await depositToken.balanceOf(user.address);
    if (balance < amountToDeposit) {
        console.error(`❌ Error: User does not have enough tokens. Needs ${AMOUNT_TO_DEPOSIT_STRING}.`);
        console.error(`  User Balance: ${ethers.formatUnits(balance, TOKEN_DECIMALS)}`);
        process.exit(1);
    }
    console.log(`User balance is: ${ethers.formatUnits(balance, TOKEN_DECIMALS)} tokens.`);

    // --- STEP 1: Generate AML Signature (Server-side) ---
    console.log("\n1. Generating AML Signature (as server)...");

    const amlDeadline = Math.floor(Date.now() / 1000) + 20 * 60; // 20 minutes

    const amlSignature = await getAMLSignature({
        contract: depositor,
        user: user.address,
        amount: amountToDeposit,
        deadline: amlDeadline,
    });
    console.log("AML Signature:", amlSignature);
    console.log("   ✅ AML Signature created.");

    // --- STEP 2: Generate EIP-2612 Permit Signature (User-side) ---
    console.log("\n2. Generating Permit Signature (as user)...");

    const permitNonce = await depositToken.nonces(user.address);
    const permitDeadline = Math.floor(Date.now() / 1000) + 20 * 60; // 20 minutes

    const tokenName = await depositToken.name();
    const chainId = (await ethers.provider.getNetwork()).chainId;

    const domain = {
        name: tokenName,
        version: "2", // USDC
        chainId: chainId,
        verifyingContract: DEPOSIT_TOKEN_ADDRESS,
    };

    const types = {
        Permit: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
            { name: "value", type: "uint256" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" },
        ],
    };

    const value = {
        owner: user.address,
        spender: depositor.target,
        value: amountToDeposit,
        nonce: permitNonce,
        deadline: permitDeadline,
    };

    const permitSignature = await user.signTypedData(domain, types, value);
    const { v, r, s } = ethers.Signature.from(permitSignature);
    console.log("   ✅ Permit Signature created.");

    // --- STEP 3: Debug Token Permissions ---
    console.log("\n3. Checking token permissions...");
    const userBalance = await depositToken.balanceOf(user.address);
    console.log(`User token balance: ${ethers.formatUnits(userBalance, TOKEN_DECIMALS)}`);

    const currentAllowance = await depositToken.allowance(user.address, depositor.target);
    console.log(`Current allowance for depositor: ${ethers.formatUnits(currentAllowance, TOKEN_DECIMALS)}`);

    // --- STEP 4: Call the Contract ---
    console.log("\n4. Attempting deposit...");

    try {
        const currentBlock = await ethers.provider.getBlock("latest");
        if (currentBlock.timestamp > amlDeadline) {
            throw new Error("AML deadline has already passed");
        }

        console.log("\nEstimating gas for deposit...");
        const estimatedGas = await depositor
            .connect(user)
            .depositWithPermit.estimateGas(
                amountToDeposit,
                DESTINATION_ADDRESS,
                amlSignature,
                amlDeadline,
                permitDeadline,
                v,
                r,
                s
            );

        const gasLimit = (BigInt(estimatedGas) * 12n) / 10n;
        console.log(`✅ Gas estimation successful: ${estimatedGas.toString()} (with 20% buffer: ${gasLimit.toString()})`);

        const feeData = await ethers.provider.getFeeData();

        const tx = await depositor
            .connect(user)
            .depositWithPermit(
                amountToDeposit,
                DESTINATION_ADDRESS,
                amlSignature,
                amlDeadline,
                permitDeadline,
                v,
                r,
                s,
                {
                    gasLimit: gasLimit,
                    gasPrice: feeData.gasPrice,
                }
            );

        console.log("Transaction sent. Waiting for confirmation...");
        const receipt = await tx.wait();
        console.log("✅ Deposit successful! Transaction hash:", receipt.hash);
    } catch (error) {
        console.error("\n❌ Transaction failed:");
        console.error("Error name:", error.name);
        console.error("Error message:", error.message);

        if (error.data) {
            console.error("Error data:", error.data);
            if (error.data.data && error.data.data.includes("d1cc7385")) {
                console.error("\n⚠️  InsufficientAllowance error detected!");
            }
        }
        throw error;
    }

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
