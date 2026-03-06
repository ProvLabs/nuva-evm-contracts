const hre = require("hardhat");
const { zeroPadValue, getAddress, hexlify } = require("ethers");
const { serializeLayout } = require("@wormhole-foundation/sdk-connect");
const { relayInstructionsLayout } = require("@wormhole-foundation/sdk-definitions");
const { default: axios } = require("axios");

// Token Address
const TOKEN_ADDRESS = process.env.USDC_ETH;
if (!TOKEN_ADDRESS) {
    throw new Error("USDC_ETH is not set.");
}

async function main() {
    const vaultCrossChain = process.env.VAULT_CROSS_CHAIN_PROXY_ETH;
    if (!vaultCrossChain) {
        throw new Error("VAULT_CROSS_CHAIN_PROXY_ETH is not set.");
    }
    console.log("Using vault:", vaultCrossChain);

    const vault = await hre.ethers.getContractAt("CrossChainVault", vaultCrossChain);

    const decimals = 6;
    const amount = hre.ethers.parseUnits("1", decimals);
    // Ethereum USDC Token Address
    const token = TOKEN_ADDRESS;
    const erc20ABI = [
        "function approve(address spender, uint256 amount) public returns (bool)",
        "function allowance(address owner, address spender) public view returns (uint256)",
    ];
    const tokenContract = new hre.ethers.Contract(token, erc20ABI, (await hre.ethers.getSigners())[0]);

    // Check current allowance
    const currentAllowance = await tokenContract.allowance(process.env.PUBLIC_KEY, vaultCrossChain);

    if (currentAllowance < amount) {
        console.log("Allowance too low. Sending approval transaction...");
        // Approve the Vault to spend your tokens
        const approveTx = await tokenContract.approve(vaultCrossChain, amount);
        await approveTx.wait();
        console.log("Approval confirmed!");
    } else {
        console.log("Sufficient allowance already exists.");
    }

    const srcChain = 10002;
    const targetChain = 10004;
    const targetDomain = 6;

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
            srcChain,
            dstChain: targetChain,
            relayInstructions: relayInstructionsHex,
        })
    ).data;

    const executorArgs = {
        refundAddress: rawAddress,
        signedQuote,
        instructions: relayInstructionsHex,
    };

    const feeArgs = {
        transferTokenFee: 0n,
        nativeTokenFee: 0n,
        payee: rawAddress,
    };

    try {
        const tx = await vault.sendTokens(
            token,
            amount,
            targetChain,
            targetDomain,
            targetRecipient,
            executorArgs,
            feeArgs,
            {
                value: BigInt(estimatedCost) + feeArgs.nativeTokenFee,
                gasLimit: 500000n,
            },
        );
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
