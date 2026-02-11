const { default: axios } = require("axios");

async function main() {
    const EXECUTOR_URL = "https://executor-testnet.labsapis.com";
    const txHash = "0xb544bc57ce2295866131e06a2e492f5c3901bc07258e84175cca7158cbb79f69";
    const chainId = 10004;

    try {
        const res = await axios.post(`${EXECUTOR_URL}/v0/status/tx`, {
            txHash,
            chainId,
        });
        console.log(res.data);
        console.log(`https://wormholelabs-xyz.github.io/executor-explorer/#/chain/${chainId}tx/${txHash}?endpoint=${encodeURIComponent(EXECUTOR_URL)}`);

    } catch (error) {
        console.log("Actual Revert Reason:", error);
    }
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
