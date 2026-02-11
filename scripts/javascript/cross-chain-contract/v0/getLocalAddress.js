const { wormhole, Wormhole } = require("@wormhole-foundation/sdk");
const evm = require("@wormhole-foundation/sdk/evm");

async function main() {
    // 1. Initialize the Wormhole SDK (This defines 'wh')
    const evmPlatform = evm.default || evm;
    const wh = await wormhole("Testnet", [evmPlatform]);

    const vaultCrossChain = process.env.VAULT_CROSS_CHAIN_BASE_V0;
    if (!vaultCrossChain) {
        throw new Error("VAULT_CROSS_CHAIN_BASE_V0 is not set.");
    }
    console.log("Using vault address:", vaultCrossChain);

    // 2. Get the Token Bridge for Sepolia
    const chainContext = wh.getChain("Sepolia");
    const tb = await chainContext.getTokenBridge();

    // 3. Define the source token info
    // If the token is from Solana, use the chain name "Solana"
    const sourceChain = "BaseSepolia";

    // We convert the string address into a UniversalAddress the SDK understands
    const sourceAddress = Wormhole.chainAddress(sourceChain, vaultCrossChain);

    console.log(sourceAddress);
    // 4. Get the local (wrapped) address on Sepolia
    try {
        const localAddress = await tb.getWrappedAsset(sourceAddress);

        if (!localAddress) {
            console.log("This token has no wrapped counterpart on Sepolia yet.");
        } else {
            console.log("Local Wrapped Address:", localAddress.toString());
        }
    } catch (e) {
        console.error("Error fetching wrapped asset:", e.message);
    }
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
