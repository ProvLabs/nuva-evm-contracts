const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("DedicatedVaultRouter", function () {

    async function deployRouterFixture() {
        const [owner, amlSigner, user] = await ethers.getSigners();

        // 1. Deploy Mock Asset
        const MockToken = await ethers.getContractFactory("MockERC20");
        const asset = await MockToken.deploy("USDC", "USDC");

        // 2. Deploy AssetVault (Underlying is USDC)
        const MockVault = await ethers.getContractFactory("MockERC4626");
        const assetVault = await MockVault.deploy(await asset.getAddress(), "Vault Shares", "vUSDC");

        // 3. Deploy StakingVault (Underlying is AssetVault Shares!)
        const stakingVault = await MockVault.deploy(await assetVault.getAddress(), "Staking Shares", "stkUSDC");

        // 4. Deploy Router via Proxy
        const Router = await ethers.getContractFactory("DedicatedVaultRouter");
        const router = await upgrades.deployProxy(Router, [
            await assetVault.getAddress(),
            await stakingVault.getAddress(),
            await amlSigner.getAddress(),
            await owner.getAddress()
        ], { kind: 'uups' });

        // 5. Setup balances
        const amount = ethers.parseUnits("100", 18);
        await asset.mint(user.address, amount);

        return { router, asset, assetVault, stakingVault, owner, amlSigner, user, amount };
    }

    async function signAML(signer, routerAddr, userAddr, amount, receiver, minVault, minStaking, deadline) {
        const network = await ethers.provider.getNetwork();

        const domain = {
            name: "DedicatedVaultRouter",
            version: "1",
            chainId: network.chainId,
            verifyingContract: routerAddr
        };

        const types = {
            Deposit: [
                { name: "sender", type: "address" },
                { name: "amount", type: "uint256" },
                { name: "receiver", type: "address" },
                { name: "minVaultShares", type: "uint256" },
                { name: "minStakingShares", type: "uint256" },
                { name: "deadline", type: "uint256" }
            ]
        };

        const value = {
            sender: userAddr,
            amount: amount,
            receiver: receiver,
            minVaultShares: minVault,
            minStakingShares: minStaking,
            deadline: deadline
        };

        return await signer.signTypedData(domain, types, value);
    }

    it("Should complete a double-hop deposit with a valid AML signature", async function () {
        const { router, asset, user, amlSigner, amount } = await loadFixture(deployRouterFixture);

        const deadline = Math.floor(Date.now() / 1000) + 3600;
        const minVault = 0n;
        const minStaking = 0n;

        // Standard approval (Permit is tried/skipped in contract)
        await asset.connect(user).approve(await router.getAddress(), amount);

        // Generate Signature
        const signature = await signAML(
            amlSigner,
            await router.getAddress(),
            user.address,
            amount,
            user.address,
            minVault,
            minStaking,
            deadline
        );

        // Execute
        await expect(router.connect(user).depositWithPermit(
            amount,
            user.address,
            minVault,
            minStaking,
            signature,
            deadline,
            0, // permitDeadline
            0, // v
            ethers.ZeroHash, // r
            ethers.ZeroHash  // s
        )).to.emit(router, "Deposited");
    });

    it("Should revert if the AML signature is tampered with", async function () {
        const { router, amlSigner, user, amount } = await loadFixture(deployRouterFixture);
        const deadline = Math.floor(Date.now() / 1000) + 3600;

        // Sign for 0 slippage
        const signature = await signAML(amlSigner, await router.getAddress(), user.address, amount, user.address, 0n, 0n, deadline);

        // Attempt to execute with 50 slippage (Signature mismatch)
        await expect(router.connect(user).depositWithPermit(
            amount, user.address, 50n, 0n, signature, deadline, 0, 0, ethers.ZeroHash, ethers.ZeroHash
        )).to.be.revertedWithCustomError(router, "InvalidAmlSignature");
    });

    it("Should revert if the AML signature has expired", async function () {
        const { router, amlSigner, user, amount } = await loadFixture(deployRouterFixture);
        const pastDeadline = Math.floor(Date.now() / 1000) - 60; // 1 minute ago

        const signature = await signAML(amlSigner, await router.getAddress(), user.address, amount, user.address, 0n, 0n, pastDeadline);

        await expect(router.connect(user).depositWithPermit(
            amount, user.address, 0n, 0n, signature, pastDeadline, 0, 0, ethers.ZeroHash, ethers.ZeroHash
        )).to.be.revertedWithCustomError(router, "AmlSignatureExpired");
    });

    it("Should prevent reusing the same AML signature", async function () {
        const { router, asset, user, amlSigner, amount } = await loadFixture(deployRouterFixture);
        const deadline = Math.floor(Date.now() / 1000) + 3600;

        await asset.connect(user).approve(await router.getAddress(), amount * 2n);
        const signature = await signAML(amlSigner, await router.getAddress(), user.address, amount, user.address, 0n, 0n, deadline);

        // First use: Success
        await router.connect(user).depositWithPermit(amount, user.address, 0n, 0n, signature, deadline, 0, 0, ethers.ZeroHash, ethers.ZeroHash);

        // Second use: Revert
        await expect(router.connect(user).depositWithPermit(
            amount, user.address, 0n, 0n, signature, deadline, 0, 0, ethers.ZeroHash, ethers.ZeroHash
        )).to.be.revertedWithCustomError(router, "AmlSignatureAlreadyUsed");
    });

    it("Should revert if the vault returns fewer shares than minVaultSharesOut", async function () {
        const { router, asset, user, amlSigner, amount } = await loadFixture(deployRouterFixture);
        const deadline = Math.floor(Date.now() / 1000) + 3600;

        // We expect 100 shares, but we demand 101 (impossible)
        const minVaultOut = amount + 1n;

        await asset.connect(user).approve(await router.getAddress(), amount);
        const signature = await signAML(amlSigner, await router.getAddress(), user.address, amount, user.address, minVaultOut, 0n, deadline);

        await expect(router.connect(user).depositWithPermit(
            amount, user.address, minVaultOut, 0n, signature, deadline, 0, 0, ethers.ZeroHash, ethers.ZeroHash
        )).to.be.revertedWithCustomError(router, "SlippageExceeded");
    });

    it("Should revert if the receiver does not match the signed receiver", async function () {
        const { router, asset, user, amlSigner, amount } = await loadFixture(deployRouterFixture);
        const deadline = Math.floor(Date.now() / 1000) + 3600;
        const attacker = (await ethers.getSigners())[4];

        // Signature is for user.address
        const signature = await signAML(amlSigner, await router.getAddress(), user.address, amount, user.address, 0n, 0n, deadline);

        await asset.connect(user).approve(await router.getAddress(), amount);

        // Attempt to send shares to attacker instead of user
        await expect(router.connect(user).depositWithPermit(
            amount, attacker.address, 0n, 0n, signature, deadline, 0, 0, ethers.ZeroHash, ethers.ZeroHash
        )).to.be.revertedWithCustomError(router, "InvalidAmlSignature");
    });

    it("Should still deposit via standard approval if permit fails (Incompatibility Test)", async function () {
        const { router, asset, user, amlSigner, amount } = await loadFixture(deployRouterFixture);
        const deadline = Math.floor(Date.now() / 1000) + 3600;

        // 1. Manually approve the router (Simulating a token without Permit support)
        await asset.connect(user).approve(await router.getAddress(), amount);

        // 2. Generate AML signature (This is still required by your contract logic)
        const signature = await signAML(amlSigner, await router.getAddress(), user.address, amount, user.address, 0n, 0n, deadline);

        // 3. Call with GARBAGE permit data (v=0, r/s=Zero)
        // The try/catch will swallow the permit failure, and safeTransferFrom will use the manual approval.
        await expect(router.connect(user).depositWithPermit(
            amount, user.address, 0n, 0n, signature, deadline, 0, 0, ethers.ZeroHash, ethers.ZeroHash
        )).to.emit(router, "Deposited");
    });

    it("Should upgrade the contract and preserve state", async function () {
        const { router, amlSigner, owner } = await loadFixture(deployRouterFixture);

        // 1. Capture state before upgrade
        const amlSignerBefore = await router.amlSigner();

        // 2. Upgrade to V2
        const RouterV2Factory = await ethers.getContractFactory("DedicatedVaultRouterV2");
        const upgraded = await upgrades.upgradeProxy(await router.getAddress(), RouterV2Factory);

        // 3. Verify state is preserved
        expect(await upgraded.amlSigner()).to.equal(amlSignerBefore);

        // 4. Verify new logic works
        await upgraded.connect(owner).togglePause();
        expect(await upgraded.isPaused()).to.be.true;
    });

    it("Should verify that variables occupy the correct storage slots", async function () {
        const { router, amlSigner, assetVault } = await loadFixture(deployRouterFixture);

        // Slot 0: assetVault (address)
        // Slot 1: asset (address)
        // Slot 2: stakingVault (address)
        // Slot 3: stakingAsset (address)
        // Slot 4: amlSigner (address)

        const slot4Value = await ethers.provider.getStorage(await router.getAddress(), 4);

        // getStorage returns a 32-byte hex string. We need to normalize the amlSigner address to match.
        const normalizedSigner = ethers.zeroPadValue(await amlSigner.getAddress(), 32).toLowerCase();

        expect(slot4Value.toLowerCase()).to.equal(normalizedSigner);
    });

    it("Should verify the __gap starts after the used slots", async function () {
        const { router } = await loadFixture(deployRouterFixture);

        // If Slot 4 is amlSigner and Slot 5 is ReentrancyGuard...
        // Slot 6 should be the start of your uint256[44] gap.
        // Since it's uninitialized, it should be 0x00...00.
        const slot6Value = await ethers.provider.getStorage(await router.getAddress(), 6);

        expect(slot6Value).to.equal(ethers.ZeroHash);
    });

    it("Should verify the physical storage layout matches the schema", async function () {
        const { router, assetVault, amlSigner } = await loadFixture(deployRouterFixture);
        const routerAddress = await router.getAddress();

        /**
         * SLOT 0: assetVault
         * Even if parent contracts use namespaced storage, your first variable 
         * defined in the implementation starts at the next available base slot.
         */
        const rawSlot0 = await ethers.provider.getStorage(routerAddress, 0);
        const expectedSlot0 = ethers.zeroPadValue(await assetVault.getAddress(), 32).toLowerCase();
        expect(rawSlot0.toLowerCase()).to.equal(expectedSlot0, "assetVault is not in Slot 0!");

        /**
         * SLOT 4: amlSigner
         * 0: assetVault, 1: asset, 2: stakingVault, 3: stakingAsset, 4: amlSigner
         */
        const rawSlot4 = await ethers.provider.getStorage(routerAddress, 4);
        const expectedSlot4 = ethers.zeroPadValue(await amlSigner.getAddress(), 32).toLowerCase();
        expect(rawSlot4.toLowerCase()).to.equal(expectedSlot4, "amlSigner is not in Slot 4!");

        /**
         * SLOT 5: The Gap Start
         * Your gap is uint256[45] private __gap;
         * It starts here. If Slot 5 is non-zero, you have a collision.
         */
        const rawSlot5 = await ethers.provider.getStorage(routerAddress, 5);
        expect(rawSlot5).to.equal(ethers.ZeroHash, "Storage gap collision detected at Slot 5");
    });

    it("Should verify ReentrancyGuard is in Namespaced Storage and base slots are clear", async function () {
        const { router } = await loadFixture(deployRouterFixture);
        const routerAddress = await router.getAddress();

        // 1. Verify Slot 5 is empty (Confirming it's part of your __gap now)
        const rawSlot5 = await ethers.provider.getStorage(routerAddress, 5);
        expect(ethers.toBigInt(rawSlot5)).to.equal(0n, "Slot 5 should be empty (part of the gap)");

        // 2. Calculate the ERC-7201 Namespaced Slot for ReentrancyGuard
        // Formula: keccak256(keccak256("openzeppelin.storage.ReentrancyGuard") - 1) & ~0xff
        const namespace = "openzeppelin.storage.ReentrancyGuard";
        const baseSlot = ethers.keccak256(ethers.toUtf8Bytes(namespace));
        const reentrancySlot = BigInt(ethers.keccak256(
            ethers.toBeArray(BigInt(baseSlot) - 1n)
        )) & ~0xffn;

        // 3. Look up the value at that specific hashed location
        const namespacedValue = await ethers.provider.getStorage(routerAddress, reentrancySlot);

        // It should be 1 (NOT_ENTERED)
        expect(ethers.toBigInt(namespacedValue)).to.equal(1n, "ReentrancyGuard not found in Namespaced Storage");

        console.log("Verified: ReentrancyGuard is safely hidden at Namespaced Slot:", reentrancySlot.toString(16));
    });

    it("Should complete a standard deposit with manual approval", async function () {
        const { router, asset, user, amlSigner, amount } = await loadFixture(deployRouterFixture);
        const deadline = Math.floor(Date.now() / 1000) + 3600;

        // 1. Manual Approval (Simulating the 'Standard' way)
        await asset.connect(user).approve(await router.getAddress(), amount);

        // 2. Generate AML Signature
        const signature = await signAML(
            amlSigner,
            await router.getAddress(),
            user.address,
            amount,
            user.address,
            0n, 0n, deadline
        );

        // 3. Execute standard deposit
        await expect(router.connect(user).deposit(
            amount,
            user.address,
            0n,
            0n,
            signature,
            deadline
        )).to.emit(router, "Deposited");

        // Verify final shares reached the user
        // (Assuming your MockVault gives 1:1 shares)
        expect(await (await ethers.getContractAt("MockERC4626", await router.stakingVault())).balanceOf(user.address))
            .to.equal(amount);
    });

    it("Should revert if deposit is called without prior approval", async function () {
        const { router, user, amlSigner, amount } = await loadFixture(deployRouterFixture);
        const deadline = Math.floor(Date.now() / 1000) + 3600;

        // We skip asset.approve(...) here

        const signature = await signAML(
            amlSigner,
            await router.getAddress(),
            user.address,
            amount,
            user.address,
            0n, 0n, deadline
        );

        // Should revert because the Router doesn't have allowance to pull tokens
        // Note: Standard OpenZeppelin ERC20s revert with 'ERC20InsufficientAllowance'
        await expect(router.connect(user).deposit(
            amount,
            user.address,
            0n,
            0n,
            signature,
            deadline
        )).to.be.revertedWithCustomError(await ethers.getContractAt("MockERC20", await router.asset()), "ERC20InsufficientAllowance");
    });
});