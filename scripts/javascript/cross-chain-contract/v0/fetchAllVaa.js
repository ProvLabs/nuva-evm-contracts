const { wormhole, isWormholeMessageId, encoding } = require("@wormhole-foundation/sdk");
const evm = require("@wormhole-foundation/sdk/evm");

async function fetchAllVAAs(txHash) {
    const wh = await wormhole("Testnet", [evm.default || evm]);
    const sourceChain = wh.getChain("Sepolia");

    console.log(`Searching transaction: ${txHash}`);

    const messages = await sourceChain.parseTransaction(txHash);

    console.log(`Found ${messages.length} Wormhole messages in this transaction.`);

    const vaas = [];

    // 3. Loop through and fetch the signed VAA for each message
    for (const msg of messages) {
        console.log(`Fetching VAA for Emitter: ${msg.emitter.toString()} | Seq: ${msg.sequence}`);

        console.log(msg);

        console.log(isWormholeMessageId(msg));
        try {
            console.log(`Fetching Raw VAA for Emitter: ${msg.emitter.toString()} | Seq: ${msg.sequence}`);

            // Use the low-level API client directly.
            // This bypasses the 'CircleTransfer' logic and the 'payloadDet' crash.
            const vaaBytes = await wh.getVaaBytes(msg);
            const vaa = "0x" + Buffer.from(vaaBytes).toString("hex");
            console.log(`✅ Raw VAA Fetched: Seq ${vaa}`);
        } catch (e) {
            console.error(`❌ Failed to fetch VAA for sequence ${msg.sequence}:`, e.message);
        }
    }

    return vaas;
}

// Example usage:
const tx = "0x3ef3cf8a5b355baa2f3234c8cebe1a7a8ee4a834e324f5a20bdec0f60b0dd106";
fetchAllVAAs(tx).then(console.log);
