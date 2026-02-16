// scripts/makeDeposit.js
const { ethers } = require("hardhat");
const { hexlify } = require("ethers");
const { serializeLayout } = require("@wormhole-foundation/sdk-connect");
const { relayInstructionsLayout } = require("@wormhole-foundation/sdk-definitions");
const { default: axios } = require("axios");

// --- START: Configuration ---
const CROSS_CHAIN_MANAGER_ADDRESS = process.env.CROSS_CHAIN_MANAGER_PROXY_BASE;
if (!CROSS_CHAIN_MANAGER_ADDRESS) {
    throw new Error("CROSS_CHAIN_MANAGER_PROXY_BASE is not set.");
}

const SHARE_TOKEN_ADDRESS = process.env.SHARE_TOKEN_ADDRESS;
if (!SHARE_TOKEN_ADDRESS) {
    throw new Error("SHARE_TOKEN_ADDRESS is not set.");
}

// Wallet to receive tokens
const DESTINATION_ADDRESS = process.env.PUBLIC_KEY;
if (!DESTINATION_ADDRESS) {
    throw new Error("PUBLIC_KEY is not set.");
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
    const DEPOSIT_TOKEN_ADDRESS = "0x036cbd53842c5426634e7929541ec2318f3dcf7e";

    console.log(`Simulating deposit as user: ${user.address}`);
    console.log(`AML Signer (server): ${amlSigner.address}`);
    console.log(`Sending tokens to destination: ${DESTINATION_ADDRESS}`);

    // 2. Get contract instances
    // We need the "Depositor" ABI to talk to the proxy
    const crossChainManager = await ethers.getContractAt("CrossChainManager", CROSS_CHAIN_MANAGER_ADDRESS);

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

    const amlDeadline = Math.floor(Date.now() / 1000) + 60 * 60;

    // Define the EIP-712 Domain
    const domain = {
        name: "Depositor",
        version: "1",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: CROSS_CHAIN_MANAGER_ADDRESS,
    };

    // Define the Types (matches your Solidity struct exactly)
    const types = {
        Deposit: [
            { name: "sender", type: "address" },
            { name: "amount", type: "uint256" },
            { name: "destinationAddress", type: "address" },
            { name: "deadline", type: "uint256" },
        ],
    };

    // Define the Values
    const value = {
        sender: user.address,
        amount: AMOUNT_TO_DEPOSIT,
        destinationAddress: DESTINATION_ADDRESS,
        deadline: amlDeadline,
    };

    // Sign using signTypedData (No manual hashing required!)
    const amlSignature = await amlSigner.signTypedData(domain, types, value);
    console.log("   ✅ AML Signature created successfully.");

    // --- STEP 1: APPROVE ---
    // The user approves the proxy contract to spend their tokens
    const currentAllowance = await depositToken.allowance(user.address, crossChainManager);

    if (currentAllowance < AMOUNT_TO_DEPOSIT) {
        console.log("Allowance too low. Sending approval transaction...");
        // Approve the Vault to spend your tokens
        const approveTx = await depositToken.connect(user).approve(crossChainManager.target, AMOUNT_TO_DEPOSIT);
        await approveTx.wait();
        console.log("Approval confirmed!");
    } else {
        console.log("Sufficient allowance already exists.");
    }

    // --- STEP 2: DEPOSIT ---
    // The user calls the deposit function on the proxy
    console.log("2. Calling deposit() on the proxy contract...");

    const srcChain = 10004;
    const targetChain = 10002;
    const targetDomain = 0;

    const relayInstructions = serializeLayout(relayInstructionsLayout, {
        requests: [
            {
                request: {
                    type: "GasInstruction",
                    gasLimit: 250000n,
                    msgValue: 0n,
                },
            },
        ],
    });

    // Convert the Uint8Array to a 0x-prefixed hex string
    const relayInstructionsHex = hexlify(relayInstructions);

    const EXECUTOR_URL = "https://executor-testnet.labsapis.com";
    const { signedQuote, estimatedCost } = (
        await axios.post(`${EXECUTOR_URL}/v0/quote`, {
            srcChain,
            dstChain: targetChain,
            relayInstructions: relayInstructionsHex,
        })
    ).data;

    const executorArgs = {
        refundAddress: user.address,
        signedQuote,
        instructions: relayInstructionsHex,
    };

    const feeArgs = {
        transferTokenFee: 0,
        nativeTokenFee: 0,
        payee: DESTINATION_ADDRESS,
    };

    // connect the `user` to the `crossChainManager` contract
    try {
        const depositTx = await crossChainManager
            .connect(user)
            .deposit(
                AMOUNT_TO_DEPOSIT,
                DESTINATION_ADDRESS,
                amlSignature,
                amlDeadline,
                targetChain,
                targetDomain,
                executorArgs,
                feeArgs,
                {
                    value: BigInt(estimatedCost) + BigInt(feeArgs.nativeTokenFee),
                    gasLimit: 500000n,
                },
            );
        const receipt = await depositTx.wait();

        console.log("   ✅ Deposit successful! Transaction hash:", receipt.hash);
    } catch (error) {
        console.log("Actual Revert Reason:", error);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
