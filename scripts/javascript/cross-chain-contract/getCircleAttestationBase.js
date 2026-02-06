const { wormhole } = require("@wormhole-foundation/sdk");
const evm = require("@wormhole-foundation/sdk/evm");
const { AbiCoder, keccak256 } = require("ethers");

async function main() {
    // Source chain transaction ID
    const sourceTxHash = "0x3ef3cf8a5b355baa2f3234c8cebe1a7a8ee4a834e324f5a20bdec0f60b0dd106";
    const wh = await wormhole("Testnet", [evm.default || evm]);
    const sourceChain = wh.getChain("Sepolia");

    const msgs = await sourceChain.parseTransaction(sourceTxHash);

    // Fetch the VAA and decode it
    const vaaBytes = await wh.getVaaBytes(msgs[0]);

    if (!vaaBytes) {
        console.error("❌ VAA not found");
        process.exit(1);
    }

    // Serialize the VAA object back to bytes
    const vaaHex = '0x' + Buffer.from(vaaBytes).toString("hex");

    const client = await sourceChain.getRpc();
    const receipt = await client.getTransactionReceipt(sourceTxHash);

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

    const redeemParams = {
        encodedWormholeMessage: vaaHex,
        circleBridgeMessage: circleBridgeMessage,
        circleAttestation: attestations,
    };

    console.log(redeemParams);
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
