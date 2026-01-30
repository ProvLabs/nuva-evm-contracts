const { wormhole } = require("@wormhole-foundation/sdk");
const evm = require("@wormhole-foundation/sdk/evm");
const { serialize } = require("@wormhole-foundation/sdk-definitions");
const { toChainId } = require("@wormhole-foundation/sdk-base");

async function main() {
    // Initialize the Wormhole SDK
    // Note: ensure the platforms (like evm) are passed in an array
    const wh = await wormhole("Testnet", [evm.default || evm]);

    // Source chain transaction ID
    const txid = "0x0bb92eb95081c77399c4f61a0378b50b5b2ba498d3a8d08545d250b3bee4925e";

    // Fetch the VAA and decode it
    const vaa = await wh.getVaa(txid, "Uint8Array", 60000);

    if (!vaa) {
        console.error("❌ VAA not found");
        process.exit(1);
    }

    const { emitterChain, emitterAddress, sequence } = vaa;
    const chainId = toChainId(emitterChain);
    const emitterHex = emitterAddress.toString();

    // Serialize the VAA object back to bytes
    const vaaBytes = serialize(vaa);
    const vaaHex = Buffer.from(vaaBytes).toString("hex");

    console.log("✅ VAA Info");
    console.log(`Chain: ${chainId}`);
    console.log(`Emitter: ${emitterHex}`);
    console.log(`Sequence: ${sequence}`);
    console.log("---");
    console.log(`VAA Bytes (hex):\n${vaaHex}`);

    return vaa;
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
