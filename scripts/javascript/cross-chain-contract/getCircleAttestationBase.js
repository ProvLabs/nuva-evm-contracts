const { wormhole, serialize } = require("@wormhole-foundation/sdk");
const evm = require("@wormhole-foundation/sdk/evm");
const { AbiCoder, keccak256 } = require("ethers");

async function main() {
    // Source chain transaction ID
    const sourceTxHash = "0x294fb04f8900570bb26d54444be010ed47535fc194bb9b4260e2e1b95df4d6ff";
    const wh = await wormhole("Testnet", [evm.default || evm]);
    const chain = wh.getChain("Sepolia");

    // Fetch the VAA and decode it
    const vaa = await wh.getVaa(sourceTxHash, "Uint8Array", 60000);

    if (!vaa) {
        console.error("❌ VAA not found");
        process.exit(1);
    }
    
    // Serialize the VAA object back to bytes
    const vaaBytes = serialize(vaa);
    const vaaHex = Buffer.from(vaaBytes).toString("hex");

    const client = await chain.getRpc();
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
