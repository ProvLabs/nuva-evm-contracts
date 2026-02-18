// scripts/makeWithdraw.js
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
const AMOUNT_TO_WITHDRAW = ethers.parseUnits("0.15", 6);
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
    const WITHDRAW_TOKEN_ADDRESS = "0x036cbd53842c5426634e7929541ec2318f3dcf7e";

    console.log(`Simulating withdraw as user: ${user.address}`);
    console.log(`AML Signer (server): ${amlSigner.address}`);
    console.log(`Sending tokens to destination: ${DESTINATION_ADDRESS}`);

    // 2. Get contract instances
    // We need the "Withdrawal" ABI to talk to the proxy
    const crossChainManager = await ethers.getContractAt("CrossChainManager", CROSS_CHAIN_MANAGER_ADDRESS);

    const PERMIT_ABI = [
        "function name() view returns (string)",
        "function nonces(address owner) view returns (uint256)",
        "function balanceOf(address account) view returns (uint256)",
        "function allowance(address owner, address spender) view returns (uint256)",
        "function approve(address spender, uint256 amount) returns (bool)",
    ];

    // We need the "IERC20" ABI to talk to the token
    const withdrawToken = await ethers.getContractAt(PERMIT_ABI, WITHDRAW_TOKEN_ADDRESS);

    // 3. Check if the user has enough tokens
    const balance = await withdrawToken.balanceOf(user.address);
    if (balance < AMOUNT_TO_WITHDRAW) {
        console.error("❌ Error: User does not have enough tokens.");
        console.error(`  User Balance: ${ethers.formatUnits(balance, 6)}`);
        console.error(`  Amount to Withdraw: ${ethers.formatUnits(AMOUNT_TO_WITHDRAW, 6)}`);
        console.log("Please get tokens from a faucet before running again.");
        return;
    }
    console.log(`User balance is: ${ethers.formatUnits(balance, 6)} tokens. Proceeding...`);

    // --- STEP 1: Generate AML Signature (Server-side) ---
    console.log("\n1. Generating AML Signature (as server)...");

    const amlDeadline = Math.floor(Date.now() / 1000) + 60 * 60;

    const chainId = (await ethers.provider.getNetwork()).chainId;

    // Define the EIP-712 Domain
    var domain = {
        name: "Withdrawal",
        version: "1",
        chainId,
        verifyingContract: CROSS_CHAIN_MANAGER_ADDRESS,
    };

    // Define the Types (matches your Solidity struct exactly)
    var types = {
        Withdraw: [
            { name: "sender", type: "address" },
            { name: "amount", type: "uint256" },
            { name: "destinationAddress", type: "address" },
            { name: "deadline", type: "uint256" },
        ],
    };

    // Define the Values
    var value = {
        sender: user.address,
        amount: AMOUNT_TO_WITHDRAW,
        destinationAddress: DESTINATION_ADDRESS,
        deadline: amlDeadline,
    };

    // Sign using signTypedData (No manual hashing required!)
    const amlSignature = await amlSigner.signTypedData(domain, types, value);
    console.log("   ✅ AML Signature created successfully.");

    // --- STEP 1: APPROVE ---
    // The user approves the proxy contract to spend their tokens
    const currentAllowance = await withdrawToken.allowance(user.address, crossChainManager);

    if (currentAllowance < AMOUNT_TO_WITHDRAW) {
        console.log("Allowance too low. Sending approval transaction...");
        // Approve the Vault to spend your tokens
        const approveTx = await withdrawToken.connect(user).approve(crossChainManager.target, AMOUNT_TO_WITHDRAW);
        await approveTx.wait();
        console.log("Approval confirmed!");
    } else {
        console.log("Sufficient allowance already exists.");
    }

    // Get the token's current nonce for the user
    const permitNonce = await withdrawToken.nonces(user.address);

    // This deadline is for the permit signature
    const permitDeadline = Math.floor(Date.now() / 1000) + 20 * 60; // 20 minutes

    domain = {
        name: await withdrawToken.name(),
        version: "2",
        chainId,
        verifyingContract: WITHDRAW_TOKEN_ADDRESS,
    };

    types = {
        Permit: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
            { name: "value", type: "uint256" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" },
        ],
    };

    value = {
        owner: user.address,
        spender: crossChainManager.target,
        value: AMOUNT_TO_WITHDRAW,
        nonce: permitNonce,
        deadline: permitDeadline,
    };

    // Sign the typed data
    const permitSignature = await user.signTypedData(domain, types, value);
    const { v, r, s } = ethers.Signature.from(permitSignature);
    console.log("   ✅ Permit Signature created.");

    // --- STEP 2: WITHDRAW ---
    // The user calls the withdraw function on the proxy
    console.log("2. Calling withdraw() on the proxy contract...");

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

    // Estimate gas for the standard withdraw function
    console.log("3. Estimating gas for withdraw...");
    const estimatedGas = await crossChainManager
        .connect(user)
        .withdrawWithPermit.estimateGas(
            AMOUNT_TO_WITHDRAW,
            DESTINATION_ADDRESS,
            amlSignature,
            amlDeadline,
            permitDeadline,
            v,
            r,
            s,
            targetChain,
            targetDomain,
            executorArgs,
            feeArgs,
        );

    // Convert to BigInt and add 20% buffer
    const gasLimit = (BigInt(estimatedGas) * 12n) / 10n;
    console.log(
        `   ✅ Gas estimation successful: ${estimatedGas.toString()} (with 20% buffer: ${gasLimit.toString()})`,
    );

    // Get current gas price
    const feeData = await ethers.provider.getFeeData();
    if (!feeData.gasPrice) {
        throw new Error("Failed to get gas price");
    }

    // connect the `user` to the `crossChainManager` contract
    try {
        const withdrawTx = await crossChainManager
            .connect(user)
            .withdrawWithPermit(
                AMOUNT_TO_WITHDRAW,
                DESTINATION_ADDRESS,
                amlSignature,
                amlDeadline,
                permitDeadline,
                v,
                r,
                s,
                targetChain,
                targetDomain,
                executorArgs,
                feeArgs,
                {
                    value: BigInt(estimatedCost) + BigInt(feeArgs.nativeTokenFee),
                    gasLimit,
                    gasPrice: feeData.gasPrice,
                },
            );
        const receipt = await withdrawTx.wait();

        console.log("   ✅ Withdraw successful! Transaction hash:", receipt.hash);
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
