const hre = require("hardhat");
const { wormhole, encoding } = require("@wormhole-foundation/sdk");
const evm = require("@wormhole-foundation/sdk/evm");
const { serialize, VAA } = require("@wormhole-foundation/sdk-definitions");

async function main() {
    // Initialize the Wormhole SDK
    // Note: ensure the platforms (like evm) are passed in an array
    const wh = await wormhole("Testnet", [evm.default || evm]);

    // Source chain transaction ID
    const txid = "0xd47e6c036c05a17a7ad4fde3857480fe349ca19797a9004e7c7e2cf9c57c9283";

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
        const tx = await vault.redeemTransferWithPayload(vaaBytes);
        console.log("Transaction sent. Waiting for confirmation...");
        const receipt = await tx.wait();
        console.log("Redemption Successful! Hash:", receipt.hash);
    } catch (err) {
        console.error("Contract Execution Failed.");
        console.error(err.reason || err.message);
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
