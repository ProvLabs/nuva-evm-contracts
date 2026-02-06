const { wormhole } = require("@wormhole-foundation/sdk");
const evm = require("@wormhole-foundation/sdk/evm");
const { serialize } = require("@wormhole-foundation/sdk-definitions");
const { toChainId } = require("@wormhole-foundation/sdk-base");

async function main() {
    // Initialize the Wormhole SDK
    // Note: ensure the platforms (like evm) are passed in an array
    const wh = await wormhole("Testnet", [evm.default || evm]);

    // Source chain transaction ID
    const txid = "0x3ef3cf8a5b355baa2f3234c8cebe1a7a8ee4a834e324f5a20bdec0f60b0dd106";

    // Fetch the VAA and decode it
    const vaa = await wh.getVaa(txid, "Uint8Array", 60000);

    if (!vaa) {
        console.error("❌ VAA not found");
        process.exit(1);
    }

    const { emitterChain, emitterAddress, sequence, hash } = vaa;
    const chainId = toChainId(emitterChain);
    const emitterHex = emitterAddress.toString();

    // Serialize the VAA object back to bytes
    const vaaBytes = serialize(vaa);
    const vaaHex = Buffer.from(vaaBytes).toString("hex");

    console.log("✅ VAA Info");
    console.log(`Tx Hash: ${txid}`);
    console.log(`Chain: ${chainId}`);
    console.log(`Emitter: ${emitterHex}`);
    console.log(`Sequence: ${sequence}`);
    console.log("---");
    console.log(`VAA Bytes (hex):\n${vaaHex}`);

    console.log("VAA: ", vaa);
    console.log("msghash: ", hash);

    return vaa;
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
