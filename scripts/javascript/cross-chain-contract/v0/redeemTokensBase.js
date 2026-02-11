const hre = require("hardhat");
const { wormhole } = require("@wormhole-foundation/sdk");
const evm = require("@wormhole-foundation/sdk/evm");
const { AbiCoder, keccak256 } = require("ethers");

async function main() {
    // Initialize the Wormhole SDK
    // Note: ensure the platforms (like evm) are passed in an array
    const wh = await wormhole("Testnet", [evm.default || evm]);
    const sourceChain = wh.getChain("Sepolia");

    // Source chain transaction ID
    const txid = "0x285e568834de0cfbcaa029bf3b65bab061f4c3e7b2a59bbc054e873785ac59c4";

    const msgs = await sourceChain.parseTransaction(txid);

    // Fetch the VAA and decode it
    const vaaBytes = await wh.getVaaBytes(msgs[0]);

    if (!vaaBytes) {
        console.error("❌ VAA not found");
        process.exit(1);
    }

    // Serialize the VAA object back to bytes
    const vaaHex = "0x" + Buffer.from(vaaBytes).toString("hex");

    const vaultAddress = process.env.VAULT_CROSS_CHAIN;
    const vault = await hre.ethers.getContractAt("CrossChainVaultV0", vaultAddress);

    const client = await sourceChain.getRpc();
    const receipt = await client.getTransactionReceipt(txid);

    // Circle MessageTransmitter 'MessageSent' Topic
    const CIRCLE_TOPIC = "0x8c5261668696ce22758910d05bab8f186d6eb247ceac2af2e82c7dc17669b036";
    const circleLog = receipt.logs.find((l) => l.topics[0] === CIRCLE_TOPIC);

    if (!circleLog) throw new Error("Circle MessageSent log not found");

    // The message is the first (and only) non-indexed parameter in MessageSent
    const abiCoder = AbiCoder.defaultAbiCoder();
    const [circleBridgeMessage] = abiCoder.decode(["bytes"], circleLog.data);

    console.log("Fetching attestations (this may take 1-2 minutes)...");

    const circleMsgHash = keccak256(circleBridgeMessage);

    console.log("Circle Message Hash:", circleMsgHash);

    const attestations = await wh.getCircleAttestation(circleMsgHash);

    console.log("Submitting VAA to contract...");
    try {
        const tx = await vault.redeemTransferWithPayload(vaaHex, circleBridgeMessage, attestations);
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
