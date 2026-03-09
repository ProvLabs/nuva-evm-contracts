const { ethers } = require("hardhat");

/**
 * @notice Script to request a redemption from the DedicatedVaultRouter.
 */
async function main() {
  const routerAddress = process.env.ROUTER_PROXY_ADDRESS;
  const nuvaVaultAddress = process.env.NUVA_VAULT_ADDRESS;
  const redeemAmountStr = process.env.REDEEM_AMOUNT;

  if (!routerAddress || !nuvaVaultAddress || !redeemAmountStr) {
    throw new Error(
      "Missing ROUTER_PROXY_ADDRESS, NUVA_VAULT_ADDRESS, or REDEEM_AMOUNT environment variables",
    );
  }

  const [user] = await ethers.getSigners();
  const router = await ethers.getContractAt(
    "DedicatedVaultRouter",
    routerAddress,
  );
  const nuvaVault = await ethers.getContractAt("ERC20", nuvaVaultAddress);

  // 1. Check User Balance
  const decimals = await nuvaVault.decimals();
  const balance = await nuvaVault.balanceOf(user.address);
  const amount = ethers.parseUnits(redeemAmountStr, decimals);

  console.log(`--- Status Check ---`);
  console.log(`User Address:    `, user.address);
  console.log(`User Balance:    `, ethers.formatUnits(balance, decimals));
  console.log(`Requested Amount:`, redeemAmountStr);

  if (balance < amount) {
    throw new Error(
      `Insufficient balance! You have ${ethers.formatUnits(balance, decimals)} but requested ${redeemAmountStr}`,
    );
  }

  const amlDeadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

  // --- STEP A: GENERATE AML SIGNATURE ---
  const amlSignerKey = process.env.AML_PRIVATE_KEY;
  if (!amlSignerKey) {
    throw new Error("Missing AML_PRIVATE_KEY environment variable");
  }
  const amlWallet = new ethers.Wallet(amlSignerKey, ethers.provider);
  const contractAmlSigner = await router.amlSigner();

  console.log(`\n--- AML Verification ---`);
  console.log(`Contract AML Signer:`, contractAmlSigner);
  console.log(`Script AML Signer:  `, amlWallet.address);

  if (contractAmlSigner.toLowerCase() !== amlWallet.address.toLowerCase()) {
    console.warn("⚠️ WARNING: AML Signer mismatch! Transaction WILL revert.");
  }

  const domain = {
    name: "DedicatedVaultRouter",
    version: "1",
    chainId: (await ethers.provider.getNetwork()).chainId,
    verifyingContract: routerAddress,
  };

  const types = {
    Redeem: [
      { name: "sender", type: "address" },
      { name: "amountNuvaShares", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  };

  const amlValue = {
    sender: user.address,
    amountNuvaShares: amount,
    deadline: amlDeadline,
  };

  const amlSignature = await amlWallet.signTypedData(domain, types, amlValue);
  console.log("✅ AML Signature generated");

  // 2. Approve Router (Non-Permit flow requires manual approval)
  console.log("\nChecking allowance...");
  const allowance = await nuvaVault.allowance(user.address, routerAddress);
  if (allowance < amount) {
    console.log("Approving router to pull Nuva shares...");
    const approveTx = await nuvaVault
      .connect(user)
      .approve(routerAddress, amount);
    await approveTx.wait();
    console.log("✅ Approval confirmed.");
  } else {
    console.log("✅ Existing allowance sufficient.");
  }

  // 3. Request Redeem
  console.log("\nSending requestRedeem transaction...");
  try {
    const tx = await router
      .connect(user)
      .requestRedeem(amount, amlSignature, amlDeadline);
    const receipt = await tx.wait();

    const event = receipt.logs.find(
      (log) => log.fragment && log.fragment.name === "RedemptionRequested",
    );
    const proxyAddress = event.args[1];

    console.log(`\n🚀 Success! Redemption requested.`);
    console.log(`Redemption Proxy Address: ${proxyAddress}`);
    console.log(`Transaction Hash:         ${receipt.hash}`);
  } catch (error) {
    if (error.data) {
      try {
        const decodedError = router.interface.parseError(error.data);
        console.error(
          `\n❌ Transaction Reverted with: ${decodedError ? decodedError.name : error.data}`,
        );
      } catch (parseError) {
        console.error(`\n❌ Transaction Reverted (Raw Data):`, error.data);
      }
    } else {
      console.error(`\n❌ Error:`, error.message);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
