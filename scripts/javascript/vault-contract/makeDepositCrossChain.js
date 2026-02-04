const { ethers } = require("hardhat");

// --- START: Configuration ---
const CLONE_ADDRESS = process.env.DEPOSITOR_CLONE_ADDRESS;
if (!CLONE_ADDRESS) {
    throw new Error("DEPOSITOR_CLONE_ADDRESS is not set.");
}

const DEPOSIT_FACTRORY_ADDR = process.env.DEPOSITOR_FACTORY_CONTRACT;
if (!DEPOSIT_FACTRORY_ADDR) {
    throw new Error("DEPOSITOR_FACTORY_CONTRACT is not set.");
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
        throw new Error("PRIVATE_KEY is not set.");
    }

    const user = new ethers.Wallet(privateKey, ethers.provider);
    const amlSigner = getAmlSigner();

    console.log(`User (depositor): ${user.address}`);
    console.log(`AML Signer (server): ${amlSigner.address}`);
    console.log(`Destination: ${DESTINATION_ADDRESS}`);

    const depositor = await ethers.getContractAt("Depositor", CLONE_ADDRESS);
    const depositToken = await ethers.getContractAt("IFullERC20", DEPOSIT_TOKEN_ADDRESS);
    const amountToDeposit = ethers.parseUnits(AMOUNT_TO_DEPOSIT_STRING, TOKEN_DECIMALS);
    const batchId = 1;

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
    const amlDeadline = Math.floor(Date.now() / 1000) + 20 * 60; // 20 minutes

    // Log the parameters that will be used for the AML signature
    console.log("\nAML Signature Parameters:");
    console.log({
        sender: user.address,
        token: DEPOSIT_TOKEN_ADDRESS,
        shareToken: SHARE_TOKEN_ADDRESS,
        amount: amountToDeposit.toString(),
        destination: DESTINATION_ADDRESS,
        deadline: amlDeadline,
    });

    // This must match exactly how the contract builds the message hash
    const packedData = ethers.solidityPacked(
        ["address", "address", "address", "uint256", "address", "uint256"],
        [
            user.address, // msg.sender
            DEPOSIT_TOKEN_ADDRESS, // address(depositToken)
            SHARE_TOKEN_ADDRESS, // shareToken
            amountToDeposit, // _amount
            DESTINATION_ADDRESS, // _destinationAddress
            amlDeadline, // _deadline
        ],
    );

    const amlMessageHash = ethers.solidityPackedKeccak256(packedData);
    console.log("AML Message Hash:", amlMessageHash);

    // Sign the hash directly (the contract will prepend the prefix)
    const amlSignature = await amlSigner.signMessage(ethers.getBytes(amlMessageHash));
    console.log("AML Signature:", amlSignature);
    console.log("   ✅ AML Signature created.");

    // --- STEP 2: Generate EIP-2612 Permit Signature (User-side) ---
    console.log("\n2. Generating Permit Signature (as user)...");

    // Get the token's current nonce for the user
    const permitNonce = await depositToken.nonces(user.address);
    // This deadline is for the permit signature
    const permitDeadline = Math.floor(Date.now() / 1000) + 20 * 60; // 20 minutes
    const tokenName = await depositToken.name();
    const chainId = (await ethers.provider.getNetwork()).chainId;

    const domain = {
        name: tokenName,
        version: "1",
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

    // Sign the typed data
    const permitSignature = await user.signTypedData(domain, types, value);
    const { v, r, s } = ethers.Signature.from(permitSignature);
    console.log("   ✅ Permit Signature created.");

    // --- STEP 3: Debug Token Permissions ---
    console.log("\n3. Checking token permissions...");

    // 1. Check token balance
    const userBalance = await depositToken.balanceOf(user.address);
    console.log(`User token balance: ${ethers.formatUnits(userBalance, TOKEN_DECIMALS)}`);

    // 2. Check current allowance
    const currentAllowance = await depositToken.allowance(user.address, depositor.target);
    console.log(`Current allowance for depositor: ${ethers.formatUnits(currentAllowance, TOKEN_DECIMALS)}`);

    // 3. Check token's permit functionality
    console.log("\nChecking token's permit functionality...");

    // Get token details
    const _tokenName = await depositToken.name();
    const tokenSymbol = await depositToken.symbol();
    const tokenDecimals = await depositToken.decimals();
    const tokenNonce = await depositToken.nonces(user.address);

    console.log(`Token: ${_tokenName} (${tokenSymbol})`);
    console.log(`Decimals: ${tokenDecimals}, Nonce: ${tokenNonce}`);

    // Try to get EIP-2612 domain separator
    try {
        const domainSeparator = await depositToken.DOMAIN_SEPARATOR();
        console.log("✅ Token supports EIP-2612 (DOMAIN_SEPARATOR found)");
        console.log(`Domain Separator: ${domainSeparator}`);
    } catch (e) {
        console.log("❌ Token may not fully support EIP-2612 (DOMAIN_SEPARATOR not found)");
    }

    // // 5. Verify the approval was successful
    // const newAllowance = await depositToken.allowance(user.address, depositor.target);
    // console.log(`New allowance: ${ethers.formatUnits(newAllowance, TOKEN_DECIMALS)}`);

    // if (newAllowance < amountToDeposit) {
    //     throw new Error("Failed to set sufficient allowance");
    // }

    // --- STEP 4: Call the Contract ---
    console.log("\n4. Attempting deposit...");

    try {
        // Get the current block timestamp to ensure AML deadline is valid
        const currentBlock = await ethers.provider.getBlock("latest");
        console.log("Current block timestamp:", currentBlock.timestamp);
        console.log("AML deadline:", amlDeadline);

        if (currentBlock.timestamp > amlDeadline) {
            throw new Error("AML deadline has already passed");
        }

        // Estimate gas for the standard deposit function
        console.log("\nEstimating gas for deposit...");
        const estimatedGas = await depositor
            .connect(user)
            .depositCrossChain.estimateGas(
                amountToDeposit,
                DESTINATION_ADDRESS,
                amlSignature,
                amlDeadline,
                permitDeadline,
                v,
                r,
                s,
                batchId,
            );

        // Convert to BigInt and add 20% buffer
        const gasLimit = (BigInt(estimatedGas) * 12n) / 10n;
        console.log(
            `✅ Gas estimation successful: ${estimatedGas.toString()} (with 20% buffer: ${gasLimit.toString()})`,
        );

        // Get current gas price
        const feeData = await ethers.provider.getFeeData();
        if (!feeData.gasPrice) {
            throw new Error("Failed to get gas price");
        }

        console.log("\nSending deposit transaction...");
        console.log({
            amount: amountToDeposit.toString(),
            destination: DESTINATION_ADDRESS,
            amlSignature: amlSignature,
            amlDeadline: amlDeadline,
            gasLimit: gasLimit.toString(),
            gasPrice: feeData.gasPrice.toString(),
        });

        const tx = await depositor
            .connect(user)
            .depositCrossChain(
                amountToDeposit,
                DESTINATION_ADDRESS,
                amlSignature,
                amlDeadline,
                permitDeadline,
                v,
                r,
                s,
                batchId,
                {
                    gasLimit: gasLimit,
                    gasPrice: feeData.gasPrice,
                },
            );

        console.log("Transaction sent. Waiting for confirmation...");
        const receipt = await tx.wait();
        console.log("✅ Deposit successful! Transaction hash:", receipt.hash);
    } catch (error) {
        console.error("\n❌ Transaction failed:");
        console.error("Error name:", error.name);
        console.error("Error message:", error.message);

        // Log error code if available
        if (error.code) {
            console.error("Error code:", error.code);
        }

        // Log error data if available
        if (error.data) {
            console.error("Error data:", error.data);

            // Try to decode the revert reason from the error data
            if (error.data.data) {
                const revertData = error.data.data;
                console.error("Revert data (hex):", revertData);

                // The first 4 bytes are the function selector, the rest is the error data
                if (revertData.length > 10) {
                    // 0x + 4 bytes (8 chars) + at least 2 chars of data
                    const errorSignature = revertData.substring(0, 10); // 0x + 4 bytes
                    console.error("Error signature:", errorSignature);

                    // Known error signatures
                    const errorSignatures = {
                        "0x08c379a0": "Error(string)",
                        "0x4e487b71": "Panic(uint256)",
                        "0xd1cc7385": "InsufficientAllowance()",
                        // Add more error signatures as needed
                    };

                    const errorName = errorSignatures[errorSignature] || "Unknown error";
                    console.error("Decoded error:", errorName);

                    // If it's a known error, provide more context
                    if (errorSignature === "0xd1cc7385") {
                        console.error("\n⚠️  InsufficientAllowance error detected!");
                        console.error(
                            "This usually means the permit signature verification failed or the allowance wasn't set correctly.",
                        );
                        console.error("Please check:");
                        console.error("1. The token contract's permit function implementation");
                        console.error("2. The deadline for the permit (might be expired)");
                        console.error("3. The signature values (v, r, s) for the permit");
                    }
                }
            }
        }

        // Log the full error object for debugging
        console.error("\nFull error object:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));

        // Re-throw the error to exit the script
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
