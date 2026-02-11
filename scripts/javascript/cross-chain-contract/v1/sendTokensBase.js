const hre = require("hardhat");
const { zeroPadValue, getAddress, hexlify } = require("ethers");
const { serializeLayout } = require("@wormhole-foundation/sdk-connect");
const { relayInstructionsLayout } = require("@wormhole-foundation/sdk-definitions");
const { default: axios } = require("axios");

async function main() {
    const vaultCrossChain = process.env.VAULT_CROSS_CHAIN_BASE_V1;
    if (!vaultCrossChain) {
        throw new Error("VAULT_CROSS_CHAIN_BASE_V1 is not set.");
    }
    console.log("Using vault:", vaultCrossChain);

    const vault = await hre.ethers.getContractAt("CrossChainVaultV1", vaultCrossChain);

    const decimals = 6;
    const amount = hre.ethers.parseUnits("1", decimals);
    // Base USDC Token Address
    const token = "0x036cbd53842c5426634e7929541ec2318f3dcf7e";
    const erc20ABI = [
        "function approve(address spender, uint256 amount) public returns (bool)",
        "function allowance(address owner, address spender) public view returns (uint256)",
    ];
    const tokenContract = new hre.ethers.Contract(token, erc20ABI, (await hre.ethers.getSigners())[0]);

    // Check current allowance
    const currentAllowance = await tokenContract.allowance(process.env.PUBLIC_KEY, vaultCrossChain);
    console.log({ token, currentAllowance, vaultCrossChain });
    if (currentAllowance < amount) {
        console.log("Allowance too low. Sending approval transaction...");
        // Approve the Vault to spend your tokens
        const approveTx = await tokenContract.approve(vaultCrossChain, amount);
        await approveTx.wait();
        console.log("Approval confirmed!");
    } else {
        console.log("Sufficient allowance already exists.");
    }

    const targetChain = 10002;

    const rawAddress = process.env.PUBLIC_KEY;
    if (!rawAddress) {
        throw new Error("PUBLIC_KEY is not set.");
    }
    const targetRecipient = zeroPadValue(getAddress(rawAddress), 32);

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
            srcChain: 10004,
            dstChain: 10002,
            relayInstructions: relayInstructionsHex,
        })
    ).data;

    const executorArgs = {
        refundAddress: rawAddress,
        signedQuote,
        instructions: relayInstructionsHex,
    };

    const feeArgs = {
        transferTokenFee: 0,
        nativeTokenFee: 0,
        payee: rawAddress,
    };

    console.log({
        targetRecipient,
        executorArgs,
        feeArgs,
        estimatedCost,
    });

    try {
        const tx = await vault.sendTokens(token, amount, targetChain, targetRecipient, executorArgs, feeArgs, {
            value: estimatedCost,
            gasLimit: 500000n,
        });
        const receipt = await tx.wait();

        console.log("send tx:", receipt.hash);
    } catch (error) {
        console.log("Actual Revert Reason:", error);
    }
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
