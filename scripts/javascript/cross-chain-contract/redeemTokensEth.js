const hre = require("hardhat");
const { wormhole, encoding } = require("@wormhole-foundation/sdk");
const evm = require("@wormhole-foundation/sdk/evm");
const { serialize, VAA } = require("@wormhole-foundation/sdk-definitions");

async function main() {
    // Initialize the Wormhole SDK
    // Note: ensure the platforms (like evm) are passed in an array
    const wh = await wormhole("Testnet", [evm.default || evm]);

    // Source chain transaction ID
    const txid = "0x518494ca99260fc00d88de6a0d9adf14068a5864430973a15be8e94582084017";

    // Fetch the VAA and decode it
    const vaa = await wh.getVaa(txid, "Uint8Array", 60000);

    if (!vaa) {
        console.error("❌ VAA not found");
        process.exit(1);
    }

    // Serialize the VAA object back to bytes
    const vaaBytes = serialize(vaa);

    const vaultAddress = process.env.VAULT_CROSS_CHAIN_ETH;
    const vault = await hre.ethers.getContractAt("CrossChainVault", vaultAddress);

    console.log("Submitting VAA to contract...");
    try {
        // Estimate gas for the standard redeem function
        console.log("\nEstimating gas for redeem...");
        const estimatedGas = await vault.redeemTransferWithPayload.estimateGas(vaaBytes);

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

        const tx = await vault.redeemTransferWithPayload(vaaBytes, {
            gasLimit: gasLimit,
            gasPrice: feeData.gasPrice,
        });

        console.log("Transaction sent. Waiting for confirmation...");
        const receipt = await tx.wait();
        console.log("Redemption Successful! Hash:", receipt.hash);
    } catch (err) {
        console.error("Contract Execution Failed.");
        console.error(err);
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
