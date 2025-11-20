// scripts/burn.js
const { ethers } = require("hardhat");

// --- START: Configuration ---
const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS;
if (!TOKEN_ADDRESS) {
    throw new Error("TOKEN_ADDRESS is not set.");
}

// --- END: Configuration ---

async function main() {
    const token = await ethers.getContractAt("CustomToken", TOKEN_ADDRESS);

    const addr = "0xDd3199E196BbF9A463500d5fB442FB7f78131F7a";
    const hasMinterRole = await token.hasRole(token.MINTER_ROLE(), addr);
    console.log(`Does ${addr} have MINTER_ROLE? ${hasMinterRole ? "✅ Yes" : "❌ No"}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
