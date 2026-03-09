const { ethers } = require("hardhat");

// --- START: Configuration ---
const CLONE_ADDRESS = process.env.WITHDRAWAL_CLONE_ADDRESS;
const SHARE_TOKEN_ADDRESS = process.env.SHARE_TOKEN_ADDRESS;
const TOKEN_DECIMALS = 6;
const AMOUNT_TO_WITHDRAW_STRING = "0.2";
// --- END: Configuration ---

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) throw new Error("PRIVATE_KEY is not set.");

  const user = new ethers.Wallet(privateKey, ethers.provider);
  const shareToken = await ethers.getContractAt(
    "IFullERC20",
    SHARE_TOKEN_ADDRESS,
  );
  const amountToWithdraw = ethers.parseUnits(
    AMOUNT_TO_WITHDRAW_STRING,
    TOKEN_DECIMALS,
  );
  const spenderAddress = CLONE_ADDRESS; // The address of the Withdrawal clone

  console.log(`User: ${user.address}`);
  console.log(`Token: ${SHARE_TOKEN_ADDRESS}`);
  console.log(`Spender: ${spenderAddress}`);

  // --- 1. Generate EIP-2612 Permit Signature ---
  console.log("\n1. Generating Permit Signature...");

  const permitNonce = await shareToken.nonces(user.address);
  const permitDeadline = Math.floor(Date.now() / 1000) + 20 * 60;
  const tokenName = await shareToken.name();
  const chainId = (await ethers.provider.getNetwork()).chainId;

  const domain = {
    name: tokenName,
    version: "1", // Correct for the CustomToken.sol you provided
    chainId: chainId,
    verifyingContract: SHARE_TOKEN_ADDRESS,
  };

  const types = {
    Permit: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  };

  const value = {
    owner: user.address,
    spender: spenderAddress,
    value: amountToWithdraw,
    nonce: permitNonce,
    deadline: permitDeadline,
  };

  const permitSignature = await user.signTypedData(domain, types, value);
  const { v, r, s } = ethers.Signature.from(permitSignature);
  console.log("   ✅ Permit Signature created.");

  // --- 2. Check Allowance BEFORE ---
  let currentAllowance = await shareToken.allowance(
    user.address,
    spenderAddress,
  );
  console.log(
    `\n2. Allowance BEFORE: ${ethers.formatUnits(currentAllowance, TOKEN_DECIMALS)}`,
  );

  // --- 3. Call permit() ---
  console.log("\n3. Calling token.permit() directly...");
  try {
    const tx = await shareToken
      .connect(user)
      .permit(
        user.address,
        spenderAddress,
        amountToWithdraw,
        permitDeadline,
        v,
        r,
        s,
      );
    console.log("   Transaction sent, waiting for receipt...");
    const receipt = await tx.wait();
    console.log(`   ✅ Permit call successful. Tx hash: ${receipt.hash}`);
  } catch (error) {
    console.error("\n❌ Error calling permit():");
    console.error("Error data:", error.data);

    // Check if the error is the one we're looking for
    if (error.data && error.data.includes("d1cc7385")) {
      console.error(
        "\n*** DEBUGGER: The 'permit' function itself is reverting with 0xd1cc7385! ***",
      );
      console.error(
        "This confirms the CustomToken contract is not the one you provided.",
      );
    } else {
      console.error(
        "\n*** DEBUGGER: The 'permit' function reverted with a DIFFERENT error. ***",
      );
      console.error(
        "This likely means your signature is invalid (e.g., wrong nonce, version, etc.)",
      );
    }
    console.error(error.message);
    return; // Stop the script
  }

  // --- 4. Check Allowance AFTER ---
  currentAllowance = await shareToken.allowance(user.address, spenderAddress);
  console.log(
    `\n4. Allowance AFTER: ${ethers.formatUnits(currentAllowance, TOKEN_DECIMALS)}`,
  );

  if (currentAllowance >= amountToWithdraw) {
    console.log("\n🎉 SUCCESS: The permit() call worked!");
    console.log("The problem is NOT your CustomToken.");
    console.log(
      "The problem IS in the AML check (AMLUtils.sol) in your main script.",
    );
  } else {
    console.log(
      "\n❌ FAILURE: The permit() call succeeded, but the allowance was NOT set.",
    );
    console.log(
      "This confirms the bug is inside your CustomToken's permit implementation (it's not calling _approve).",
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
