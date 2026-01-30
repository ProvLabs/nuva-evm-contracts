const hre = require("hardhat");

async function checkBalance() {
    const tokenAddress = "0x036cbd53842c5426634e7929541ec2318f3dcf7e"; // Your token (e.g., USDC)
    const walletAddress = process.env.PUBLIC_KEY;

    // We only need the 'balanceOf' and 'decimals' functions from the ERC20 ABI
    const abi = [
        "function balanceOf(address owner) view returns (uint256)",
        "function decimals() view returns (uint8)",
        "function symbol() view returns (string)",
    ];

    // Connect to the contract
    const tokenContract = await hre.ethers.getContractAt(abi, tokenAddress);

    // Fetch data in parallel for speed
    const [balance, decimals, symbol] = await Promise.all([
        tokenContract.balanceOf(walletAddress),
        tokenContract.decimals(),
        tokenContract.symbol(),
    ]);

    // Format the big integer into a human-readable string
    const formattedBalance = hre.ethers.formatUnits(balance, decimals);

    console.log(`-------------------------------------------`);
    console.log(`Wallet: ${walletAddress}`);
    console.log(`Balance: ${formattedBalance} ${symbol}`);
    console.log(`-------------------------------------------`);
}

checkBalance().catch(console.error);
