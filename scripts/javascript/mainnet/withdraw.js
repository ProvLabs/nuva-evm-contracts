const { GcpKmsSigner } = require("@cuonghx.gu-tech/ethers-gcp-kms-signer");
const { ethers } = require("hardhat");

// --- START: Configuration & Argument Parsing ---

// 1. Internal Configuration Mapping
// This defines the specific addresses and settings for each target.
const TARGET_CONFIG = {
    nvylds: {
        clone: "0x16D582E0A2E21450C107c7d118c88F0aD318790B",
        token: "0x82C9E80F0E099bf61E061EE96E23DF605388D902",
        decimals: 12,
    },
    nvheloc: {
        clone: "0xC5b72376dFc4123e1fd481736E68dBA35983cF69",
        token: "0x4aCB074fF8152de067be3da282DdA6469992B42d",
        decimals: 12,
    },
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

// 2. Retrieve Arguments
const TARGET_KEY = getArg("--target", "TARGET");
const AMOUNT_TO_WITHDRAW_STRING = getArg("--amount", "AMOUNT");

// 3. Validate Inputs
if (!TARGET_KEY || !AMOUNT_TO_WITHDRAW_STRING) {
    console.error("\n❌ Error: Missing required arguments.");
    console.error("Usage via Flags:   npx hardhat run script.js -- --target <NAME> --amount <AMOUNT>");
    console.error("Usage via Env Var: TARGET=<NAME> AMOUNT=<AMOUNT> npx hardhat run script.js");
    console.error(`\nValid targets: ${Object.keys(TARGET_CONFIG).join(", ")}\n`);
    process.exit(1);
}

// 4. Resolve Configuration from Map
const config = TARGET_CONFIG[TARGET_KEY];

if (!config) {
    console.error(`\n❌ Error: Unknown target '${TARGET_KEY}'.`);
    console.error(`Please use one of: ${Object.keys(TARGET_CONFIG).join(", ")}\n`);
    process.exit(1);
}

const CLONE_ADDRESS = config.clone;
const SHARE_TOKEN_ADDRESS = config.token;
const TOKEN_DECIMALS = config.decimals;

// --- END: Configuration ---

const kmsConfig = {
    projectId: "provlabs-prod",
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
        name: "Withdrawal",
        version: "1",
        chainId: chainId,
        verifyingContract: await contract.getAddress(),
    };

    const types = {
        Withdraw: [
            { name: "sender", type: "address" },
            { name: "amount", type: "uint256" },
            { name: "deadline", type: "uint256" },
        ],
    };

    const value = {
        sender: user,
        amount: amount,
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
    console.log("🚀 Starting Withdraw Script");
    console.log(`Target Name:     ${TARGET_KEY}`);
    console.log(`Clone Address:   ${CLONE_ADDRESS}`);
    console.log(`Share Token:     ${SHARE_TOKEN_ADDRESS}`);
    console.log(`Withdraw Amount: ${AMOUNT_TO_WITHDRAW_STRING}`);
    console.log("-----------------------------------------\n");

    // 1. Setup Signers and Contracts
    const privateKey = process.env.MAINNET_PRIVATE_KEY;
    if (!privateKey) {
        throw new Error("MAINNET_PRIVATE_KEY is not set.");
    }

    const user = new ethers.Wallet(privateKey, ethers.provider);

    console.log(`User (withdrawer): ${user.address}`);
    console.log(`AML Signer (server): ${await amlSigner.getAddress()}`);

    const withdrawal = await ethers.getContractAt("Withdrawal", CLONE_ADDRESS);
    const shareToken = await ethers.getContractAt("IFullERC20", SHARE_TOKEN_ADDRESS);
    const amountToWithdraw = ethers.parseUnits(AMOUNT_TO_WITHDRAW_STRING, TOKEN_DECIMALS);

    // 2. Check User Balance
    const balance = await shareToken.balanceOf(user.address);
    if (balance < amountToWithdraw) {
        console.error(`❌ Error: User does not have enough tokens. Needs ${AMOUNT_TO_WITHDRAW_STRING}.`);
        console.error(`  User Balance: ${ethers.formatUnits(balance, TOKEN_DECIMALS)}`);
        process.exit(1);
    }
    console.log(`User balance is: ${ethers.formatUnits(balance, TOKEN_DECIMALS)} tokens.`);

    // --- STEP 1: Generate AML Signature (Server-side) ---
    console.log("\n1. Generating AML Signature (as server)...");

    const amlDeadline = Math.floor(Date.now() / 1000) + 20 * 60; // 20 minutes

    const amlSignature = await getAMLSignature({
        contract: withdrawal,
        user: user.address,
        amount: amountToWithdraw,
        deadline: amlDeadline,
    });
    console.log("AML Signature:", amlSignature);
    console.log("   ✅ AML Signature created.");

    // --- STEP 2: Generate EIP-2612 Permit Signature (User-side) ---
    console.log("\n2. Generating Permit Signature (as user)...");

    const permitNonce = await shareToken.nonces(user.address);
    const permitDeadline = Math.floor(Date.now() / 1000) + 20 * 60; // 20 minutes
    const tokenName = await shareToken.name();
    const chainId = (await ethers.provider.getNetwork()).chainId;

    const domain = {
        name: tokenName,
        version: "1",
        chainId: chainId,
        verifyingContract: SHARE_TOKEN_ADDRESS,
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
        spender: withdrawal.target,
        value: amountToWithdraw,
        nonce: permitNonce,
        deadline: permitDeadline,
    };

    const permitSignature = await user.signTypedData(domain, types, value);
    const { v, r, s } = ethers.Signature.from(permitSignature);
    console.log("   ✅ Permit Signature created.");

    // --- STEP 3: Debug Token Permissions ---
    console.log("\n3. Checking token permissions...");
    const userBalance = await shareToken.balanceOf(user.address);
    console.log(`User token balance: ${ethers.formatUnits(userBalance, TOKEN_DECIMALS)}`);

    const currentAllowance = await shareToken.allowance(user.address, withdrawal.target);
    console.log(`Current allowance for withdrawer: ${ethers.formatUnits(currentAllowance, TOKEN_DECIMALS)}`);

    // --- STEP 4: Call the Contract ---
    console.log("\n4. Attempting withdraw...");

    try {
        const currentBlock = await ethers.provider.getBlock("latest");
        if (currentBlock.timestamp > amlDeadline) {
            throw new Error("AML deadline has already passed");
        }

        console.log("\nEstimating gas for withdrawWithPermit...");
        const estimatedGas = await withdrawal
            .connect(user)
            .withdrawWithPermit.estimateGas(amountToWithdraw, amlSignature, amlDeadline, permitDeadline, v, r, s);

        const gasLimit = (BigInt(estimatedGas) * 12n) / 10n;
        console.log(
            `✅ Gas estimation successful: ${estimatedGas.toString()} (with 20% buffer: ${gasLimit.toString()})`,
        );

        const feeData = await ethers.provider.getFeeData();

        console.log("\nSending withdrawWithPermit transaction...");
        const tx = await withdrawal
            .connect(user)
            .withdrawWithPermit(amountToWithdraw, amlSignature, amlDeadline, permitDeadline, v, r, s, {
                gasLimit: gasLimit,
                gasPrice: feeData.gasPrice,
            });

        console.log("Transaction sent, waiting for confirmation...");
        const receipt = await tx.wait(); // Default 1 confirmation
        console.log(`✅ Withdraw successful! Transaction hash: ${receipt.hash}`);
    } catch (error) {
        console.error("\n❌ Transaction failed:");
        console.error("Error name:", error.name);
        console.error("Error message:", error.message);

        if (error.data) {
            console.error("Error data:", error.data);
            // Basic check for common InsufficientAllowance
            if (error.data.data && error.data.data.includes("d1cc7385")) {
                console.error("\n⚠️  InsufficientAllowance error detected!");
            }
        }
        throw error;
    }

    // Final Verification
    const finalBalance = await shareToken.balanceOf(CLONE_ADDRESS);
    console.log("-----------------------------------------");
    console.log("🎉 Verification Complete 🎉");
    console.log(`Clone contract balance (shares): ${ethers.formatUnits(finalBalance, TOKEN_DECIMALS)}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
