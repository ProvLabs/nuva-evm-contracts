const { wormhole } = require("@wormhole-foundation/sdk");
const evm = require("@wormhole-foundation/sdk/evm");

async function main() {
    // Initialize the Wormhole SDK
    // Note: ensure the platforms (like evm) are passed in an array
    const wh = await wormhole("Testnet", [evm.default || evm]);
    const sourceChain = wh.getChain("Sepolia");

    // Source chain transaction ID
    const txid = "0x3ef3cf8a5b355baa2f3234c8cebe1a7a8ee4a834e324f5a20bdec0f60b0dd106";
    const msgs = await sourceChain.parseTransaction(txid);

    // Fetch the VAA and decode it
    const vaaBytes = await wh.getVaaBytes(msgs[0]);

    if (!vaaBytes) {
        console.error("❌ VAA not found");
        process.exit(1);
    }

    // Serialize the VAA object back to bytes
    const vaaHex = '0x' + Buffer.from(vaaBytes).toString("hex");

    console.log(`VAA Bytes (hex):\n${vaaHex}`);
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
