const { ethers, upgrades } = require("hardhat");

const SHARE_TOKEN_ADDRESS = process.env.SHARE_TOKEN_ADDRESS;
if (!SHARE_TOKEN_ADDRESS) {
    throw new Error("SHARE_TOKEN_ADDRESS is not set.");
}

const AML_SIGNER = process.env.AML_SIGNER_KEY;
if (!AML_SIGNER) {
    throw new Error("AML_SIGNER_KEY is not set.");
}

const CROSS_CHAIN_VAULT = process.env.VAULT_CROSS_CHAIN_PROXY_ETH;
if (!CROSS_CHAIN_VAULT) {
    throw new Error("VAULT_CROSS_CHAIN_PROXY_ETH is not set.");
}

// Token Address
const TOKEN_ADDRESS = process.env.USDC_ETH;
if (!TOKEN_ADDRESS) {
    throw new Error("USDC_ETH is not set.");
}

async function main() {
    // 1. Define the addresses for the initializer arguments
    // Replace these with your actual deployed token and manager addresses
    const [user] = await ethers.getSigners();
    const burnerAddress = user.address;

    console.log("Deploying CrossChainManager...");

    // 2. Get the contract factory
    const CrossChainManager = await ethers.getContractFactory("CrossChainManager");

    // 3. Deploy the proxy and call the initialize function
    const proxy = await upgrades.deployProxy(
        CrossChainManager,
        [TOKEN_ADDRESS, SHARE_TOKEN_ADDRESS, AML_SIGNER, CROSS_CHAIN_VAULT, burnerAddress],
        {
            initializer: "initialize",
            kind: "uups",
        },
    );

    await proxy.waitForDeployment();

    const proxyAddress = await proxy.getAddress();
    const implementationAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);

    console.log("----------------------------------------------");
    console.log(`Proxy deployed to: ${proxyAddress}`);
    console.log(`Implementation deployed to: ${implementationAddress}`);
    console.log("----------------------------------------------");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
