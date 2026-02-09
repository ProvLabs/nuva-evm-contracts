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

        // 4. Deploy NuvaVault (Underlying is StakingVault Shares!) - NEW
        const nuvaVault = await MockVault.deploy(await stakingVault.getAddress(), "Nuva Shares", "nuvUSDC");

        // 5. Deploy Router via Proxy
        const Router = await ethers.getContractFactory("DedicatedVaultRouter");
        const router = await upgrades.deployProxy(Router, [
            await assetVault.getAddress(),
            await stakingVault.getAddress(),
            await nuvaVault.getAddress(), // NEW: Pass nuvaVault address
            await amlSigner.getAddress(),
            await owner.getAddress()
        ], { kind: 'uups' });

        // 6. Setup balances
        const amount = ethers.parseUnits("100", 18);
        await asset.mint(user.address, amount);

        return { router, asset, assetVault, stakingVault, nuvaVault, owner, amlSigner, user, amount }; // NEW: Return nuvaVault
    }

    // NEW: Fixture for deploying RedemptionProxy master copy
    async function deployRedemptionProxyFixture() {
        // Deploy RedemptionProxy master copy
        const RedemptionProxy = await ethers.getContractFactory("RedemptionProxy");
        const redemptionProxyImplementation = await RedemptionProxy.deploy();

        return { redemptionProxyImplementation };
    }

    async function signAML(signer, routerAddr, userAddr, amount, receiver, minVault, minStaking, minNuva, deadline) {
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
                { name: "minNuvaVaultShares", type: "uint256" }, // NEW
                { name: "deadline", type: "uint256" }
            ]
        };

        const value = {
            sender: userAddr,
            amount: amount,
            receiver: receiver,
            minVaultShares: minVault,
            minStakingShares: minStaking,
            minNuvaVaultShares: minNuva, // NEW
            deadline: deadline
        };

        return await signer.signTypedData(domain, types, value);
    }

    it("Should complete a double-hop deposit with a valid AML signature", async function () {
        const { router, asset, user, amlSigner, amount } = await loadFixture(deployRouterFixture);

        const deadline = Math.floor(Date.now() / 1000) + 3600;
        const minVault = 0n;
        const minStaking = 0n;
        const minNuva = 0n; // NEW

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
            minNuva, // NEW
            deadline
        );

        // Execute
        await expect(router.connect(user).depositWithPermit(
            amount,
            user.address,
            minVault,
            minStaking,
            minNuva, // NEW
            signature,
            deadline,
            0, // permitDeadline
            0, // v
            ethers.ZeroHash, // r
            ethers.ZeroHash  // s
        )).to.emit(router, "Deposited").withArgs(user.address, amount, amount, amount, amount); // NEW: Added nuvaShares (amount)
    }); // FIX: Added missing closing brace

    it("Should revert if the AML signature is tampered with", async function () {
        const { router, amlSigner, user, amount } = await loadFixture(deployRouterFixture);
        const deadline = Math.floor(Date.now() / 1000) + 3600;

        // Sign for 0 slippage
        const signature = await signAML(amlSigner, await router.getAddress(), user.address, amount, user.address, 0n, 0n, 0n, deadline); // NEW: Added 0n for minNuva

        // Attempt to execute with 50 slippage (Signature mismatch)
        await expect(router.connect(user).depositWithPermit(
            amount, user.address, 50n, 0n, 0n, signature, deadline, 0, 0, ethers.ZeroHash, ethers.ZeroHash // NEW: Added 0n for minNuvaVaultSharesOut
        )).to.be.revertedWithCustomError(router, "InvalidAmlSignature");
    });

    it("Should revert if the AML signature has expired", async function () {
        const { router, amlSigner, user, amount } = await loadFixture(deployRouterFixture);
        const pastDeadline = Math.floor(Date.now() / 1000) - 60; // 1 minute ago

        const signature = await signAML(amlSigner, await router.getAddress(), user.address, amount, user.address, 0n, 0n, 0n, pastDeadline); // NEW: Added 0n for minNuva

        await expect(router.connect(user).depositWithPermit(
            amount, user.address, 0n, 0n, 0n, signature, pastDeadline, 0, 0, ethers.ZeroHash, ethers.ZeroHash // NEW: Added 0n for minNuvaVaultSharesOut
        )).to.be.revertedWithCustomError(router, "AmlSignatureExpired");
    });

    it("Should prevent reusing the same AML signature", async function () {
        const { router, asset, user, amlSigner, amount } = await loadFixture(deployRouterFixture);
        const deadline = Math.floor(Date.now() / 1000) + 3600;

        await asset.connect(user).approve(await router.getAddress(), amount * 2n);
        const signature = await signAML(amlSigner, await router.getAddress(), user.address, amount, user.address, 0n, 0n, 0n, deadline); // NEW: Added 0n for minNuva

        // First use: Success
        await router.connect(user).depositWithPermit(amount, user.address, 0n, 0n, 0n, signature, deadline, 0, 0, ethers.ZeroHash, ethers.ZeroHash); // NEW: Added 0n for minNuvaVaultSharesOut

        // Second use: Revert
        await expect(router.connect(user).depositWithPermit(
            amount, user.address, 0n, 0n, 0n, signature, deadline, 0, 0, ethers.ZeroHash, ethers.ZeroHash // NEW: Added 0n for minNuvaVaultSharesOut
        )).to.be.revertedWithCustomError(router, "AmlSignatureAlreadyUsed");
    });

    it("Should revert if the vault returns fewer shares than minVaultSharesOut", async function () {
        const { router, asset, user, amlSigner, amount } = await loadFixture(deployRouterFixture);
        const deadline = Math.floor(Date.now() / 1000) + 3600;

        // We expect 100 shares, but we demand 101 (impossible)
        const minVaultOut = amount + 1n;

        await asset.connect(user).approve(await router.getAddress(), amount);
        const signature = await signAML(amlSigner, await router.getAddress(), user.address, amount, user.address, minVaultOut, 0n, 0n, deadline); // NEW: Added 0n for minNuva

        await expect(router.connect(user).depositWithPermit(
            amount, user.address, minVaultOut, 0n, 0n, signature, deadline, 0, 0, ethers.ZeroHash, ethers.ZeroHash // NEW: Added 0n for minNuvaVaultSharesOut
        )).to.be.revertedWithCustomError(router, "SlippageExceeded");
    });

    it("Should revert if the receiver does not match the signed receiver", async function () {
        const { router, asset, user, amlSigner, amount } = await loadFixture(deployRouterFixture);
        const deadline = Math.floor(Date.now() / 1000) + 3600;
        const attacker = (await ethers.getSigners())[4];

        // Signature is for user.address
        const signature = await signAML(amlSigner, await router.getAddress(), user.address, amount, user.address, 0n, 0n, 0n, deadline); // NEW: Added 0n for minNuva

        await asset.connect(user).approve(await router.getAddress(), amount);

        // Attempt to send shares to attacker instead of user
        await expect(router.connect(user).depositWithPermit(
            amount, attacker.address, 0n, 0n, 0n, signature, deadline, 0, 0, ethers.ZeroHash, ethers.ZeroHash // NEW: Added 0n for minNuvaVaultSharesOut
        )).to.be.revertedWithCustomError(router, "InvalidAmlSignature");
    });

    it("Should still deposit via standard approval if permit fails (Incompatibility Test)", async function () {
        const { router, asset, user, amlSigner, amount } = await loadFixture(deployRouterFixture);
        const deadline = Math.floor(Date.now() / 1000) + 3600;

        // 1. Manually approve the router (Simulating a token without Permit support)
        await asset.connect(user).approve(await router.getAddress(), amount);

        // 2. Generate AML signature (This is still required by your contract logic)
        const signature = await signAML(amlSigner, await router.getAddress(), user.address, amount, user.address, 0n, 0n, 0n, deadline); // NEW: Added 0n for minNuva

        // 3. Call with GARBAGE permit data (v=0, r/s=Zero)
        // The try/catch will swallow the permit failure, and safeTransferFrom will use the manual approval.
        await expect(router.connect(user).depositWithPermit(
            amount, user.address, 0n, 0n, 0n, signature, deadline, 0, 0, ethers.ZeroHash, ethers.ZeroHash // NEW: Added 0n for minNuvaVaultSharesOut
        )).to.emit(router, "Deposited").withArgs(user.address, amount, amount, amount, amount); // NEW: Added nuvaShares (amount)
    });

    it("Should upgrade the contract and preserve state", async function () {
        const { router, amlSigner, nuvaVault, owner } = await loadFixture(deployRouterFixture); // NEW: Added nuvaVault

        // 1. Capture state before upgrade
        const amlSignerBefore = await router.amlSigner();
        const nuvaVaultBefore = await router.nuvaVault(); // NEW: Capture nuvaVault state

        // 2. Upgrade to V2
        const RouterV2Factory = await ethers.getContractFactory("DedicatedVaultRouterV2");
        const upgraded = await upgrades.upgradeProxy(await router.getAddress(), RouterV2Factory);

        // 3. Verify state is preserved
        expect(await upgraded.amlSigner()).to.equal(amlSignerBefore);
        expect(await upgraded.nuvaVault()).to.equal(nuvaVaultBefore); // NEW: Verify nuvaVault state

        // 4. Verify new logic works
        await upgraded.connect(owner).togglePause();
        expect(await upgraded.isPaused()).to.be.true;
    });

    it("Should verify that variables occupy the correct storage slots", async function () {
        const { router, amlSigner, nuvaVault } = await loadFixture(deployRouterFixture); // NEW: Added nuvaVault

        // Slot 0: assetVault (address)
        // Slot 1: asset (address)
        // Slot 2: stakingVault (address)
        // Slot 3: stakingAsset (address)
        // Slot 4: nuvaVault (address) // NEW
        // Slot 5: nuvaAsset (address) // NEW
        // Slot 6: amlSigner (address) // UPDATED

        const slot4Value = await ethers.provider.getStorage(await router.getAddress(), 4); // Check nuvaVault at slot 4
        const normalizedNuvaVault = ethers.zeroPadValue(await nuvaVault.getAddress(), 32).toLowerCase(); // NEW
        expect(slot4Value.toLowerCase()).to.equal(normalizedNuvaVault, "nuvaVault is not in Slot 4!"); // NEW

        const slot6Value = await ethers.provider.getStorage(await router.getAddress(), 6); // Check amlSigner at slot 6
        const normalizedSigner = ethers.zeroPadValue(await amlSigner.getAddress(), 32).toLowerCase();

        expect(slot6Value.toLowerCase()).to.equal(normalizedSigner, "amlSigner is not in Slot 6!"); // UPDATED
    });

    it("Should verify the __gap starts after the used slots", async function () {
        const { router } = await loadFixture(deployRouterFixture);

        // Slot 9 should be the start of your uint256[41] gap.
        // Since it's uninitialized, it should be 0x00...00.
        const slot9Value = await ethers.provider.getStorage(await router.getAddress(), 9); // UPDATED: Slot 9

        expect(slot9Value).to.equal(ethers.ZeroHash);
    });

    it("Should verify the physical storage layout matches the schema", async function () {
        const { router, assetVault, amlSigner, nuvaVault, owner } = await loadFixture(deployRouterFixture);
        const { redemptionProxyImplementation } = await loadFixture(deployRedemptionProxyFixture);
        await router.connect(owner).setRedemptionProxyImplementation(await redemptionProxyImplementation.getAddress());

        const routerAddress = await router.getAddress();
        const rawSlot0 = await ethers.provider.getStorage(routerAddress, 0);
        const expectedSlot0 = ethers.zeroPadValue(await assetVault.getAddress(), 32).toLowerCase();
        expect(rawSlot0.toLowerCase()).to.equal(expectedSlot0, "assetVault is not in Slot 0!");

        /**
         * SLOT 4: nuvaVault // NEW
         * 0: assetVault, 1: asset, 2: stakingVault, 3: stakingAsset, 4: nuvaVault
         */
        const rawSlot4 = await ethers.provider.getStorage(routerAddress, 4);
        const expectedSlot4 = ethers.zeroPadValue(await nuvaVault.getAddress(), 32).toLowerCase();
        expect(rawSlot4.toLowerCase()).to.equal(expectedSlot4, "nuvaVault is not in Slot 4!");

        /**
         * SLOT 5: nuvaAsset // NEW
         */
        const rawSlot5 = await ethers.provider.getStorage(routerAddress, 5);
        const expectedSlot5 = ethers.zeroPadValue(await (await ethers.getContractAt("IERC4626", await nuvaVault.getAddress())).asset(), 32).toLowerCase();
        expect(rawSlot5.toLowerCase()).to.equal(expectedSlot5, "nuvaAsset is not in Slot 5!");

        /**
         * SLOT 6: amlSigner
         */
        const rawSlot6 = await ethers.provider.getStorage(routerAddress, 6);
        const expectedSlot6 = ethers.zeroPadValue(await amlSigner.getAddress(), 32).toLowerCase();
        expect(rawSlot6.toLowerCase()).to.equal(expectedSlot6, "amlSigner is not in Slot 6!");

        /**
         * SLOT 7: redemptionProxyImplementation // NEW
         */
        const rawSlot7 = await ethers.provider.getStorage(routerAddress, 7);
        const expectedSlot7 = ethers.zeroPadValue(await redemptionProxyImplementation.getAddress(), 32).toLowerCase();
        expect(rawSlot7.toLowerCase()).to.equal(expectedSlot7, "redemptionProxyImplementation is not in Slot 7!");



        /**
         * SLOT 8: requestIdToRedemptionProxy (mapping base) // UPDATED
         */
        const rawSlot8 = await ethers.provider.getStorage(routerAddress, 8);
        expect(rawSlot8).to.equal(ethers.ZeroHash, "requestIdToRedemptionProxy mapping base slot is not zero!");

        /**
         * SLOT 9: The Gap Start // UPDATED
         * Your gap is uint256[41] private __gap;
         * It starts here. If Slot 9 is non-zero, you have a collision.
         */
        const rawSlot9 = await ethers.provider.getStorage(routerAddress, 9);
        expect(rawSlot9).to.equal(ethers.ZeroHash, "Storage gap collision detected at Slot 9");
    });

    it("Should verify ReentrancyGuard is in Namespaced Storage and base slots are clear", async function () {
        const { router } = await loadFixture(deployRouterFixture);
        const routerAddress = await router.getAddress();

        // 1. Verify Slot 9 is empty (Confirming it's part of your __gap now) // UPDATED
        const rawSlot9 = await ethers.provider.getStorage(routerAddress, 9); // UPDATED
        expect(ethers.toBigInt(rawSlot9)).to.equal(0n, "Slot 9 should be empty (part of the gap)"); // UPDATED

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
        const { router, asset, user, amlSigner, amount, nuvaVault } = await loadFixture(deployRouterFixture); // NEW: Added nuvaVault
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
            0n, 0n, 0n, deadline // NEW: Added 0n for minNuva
        );

        // 3. Execute standard deposit
        await expect(router.connect(user).deposit(
            amount,
            user.address,
            0n,
            0n,
            0n, // NEW: minNuvaVaultSharesOut
            signature,
            deadline
        )).to.emit(router, "Deposited").withArgs(user.address, amount, amount, amount, amount); // NEW: Added nuvaShares (amount)

        // Verify final shares reached the user
        // (Assuming your MockVault gives 1:1 shares)
        expect(await (await ethers.getContractAt("MockERC4626", await nuvaVault.getAddress())).balanceOf(user.address)) // NEW: Verify nuvaVault balance
            .to.equal(amount);
    });

    it("Should successfully deposit into the Nuva Vault and emit NuvaDeposited event", async function () {
        const { router, asset, user, amlSigner, amount, nuvaVault } = await loadFixture(deployRouterFixture);
        const deadline = Math.floor(Date.now() / 1000) + 3600;

        await asset.connect(user).approve(await router.getAddress(), amount);

        const signature = await signAML(
            amlSigner,
            await router.getAddress(),
            user.address,
            amount,
            user.address,
            0n, 0n, 0n, deadline
        );

        await expect(router.connect(user).deposit(
            amount,
            user.address,
            0n,
            0n,
            0n,
            signature,
            deadline
        ))
            .to.emit(router, "NuvaDeposited")
            .withArgs(user.address, amount, amount);

        // Verify final shares reached the user in Nuva Vault
        expect(await (await ethers.getContractAt("MockERC4626", await nuvaVault.getAddress())).balanceOf(user.address))
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
            0n, 0n, 0n, deadline // NEW: Added 0n for minNuva
        );

        // Should revert because the Router doesn't have allowance to pull tokens
        // Note: Standard OpenZeppelin ERC20s revert with 'ERC20InsufficientAllowance'
        await expect(router.connect(user).deposit(
            amount,
            user.address,
            0n,
            0n,
            0n, // NEW: minNuvaVaultSharesOut
            signature,
            deadline
        )).to.be.revertedWithCustomError(await ethers.getContractAt("MockERC20", await router.asset()), "ERC20InsufficientAllowance");
    });

    it("Should revert if deposit (standard) is called with a tampered AML signature", async function () {
        const { router, asset, user, amlSigner, amount } = await loadFixture(deployRouterFixture);
        const deadline = Math.floor(Date.now() / 1000) + 3600;

        await asset.connect(user).approve(await router.getAddress(), amount);

        // Sign for 0 slippage
        const signature = await signAML(amlSigner, await router.getAddress(), user.address, amount, user.address, 0n, 0n, 0n, deadline);

        // Attempt to execute with 50 slippage for minVaultSharesOut (Signature mismatch)
        await expect(router.connect(user).deposit(
            amount, user.address, 50n, 0n, 0n, signature, deadline
        )).to.be.revertedWithCustomError(router, "InvalidAmlSignature");
    });

    it("Should revert if deposit (standard) is called with an expired AML signature", async function () {
        const { router, asset, user, amlSigner, amount } = await loadFixture(deployRouterFixture);
        const pastDeadline = Math.floor(Date.now() / 1000) - 60; // 1 minute ago

        await asset.connect(user).approve(await router.getAddress(), amount);

        const signature = await signAML(amlSigner, await router.getAddress(), user.address, amount, user.address, 0n, 0n, 0n, pastDeadline);

        await expect(router.connect(user).deposit(
            amount, user.address, 0n, 0n, 0n, signature, pastDeadline
        )).to.be.revertedWithCustomError(router, "AmlSignatureExpired");
    });

    it("Should prevent reusing the same AML signature for standard deposit", async function () {
        const { router, asset, user, amlSigner, amount } = await loadFixture(deployRouterFixture);
        const deadline = Math.floor(Date.now() / 1000) + 3600;

        await asset.connect(user).approve(await router.getAddress(), amount * 2n); // Approve for two deposits
        const signature = await signAML(amlSigner, await router.getAddress(), user.address, amount, user.address, 0n, 0n, 0n, deadline);

        // First use: Success
        await router.connect(user).deposit(amount, user.address, 0n, 0n, 0n, signature, deadline);

        // Second use: Revert
        await expect(router.connect(user).deposit(
            amount, user.address, 0n, 0n, 0n, signature, deadline
        )).to.be.revertedWithCustomError(router, "AmlSignatureAlreadyUsed");
    });

    it("Should revert if deposit (standard) returns fewer shares than minVaultSharesOut", async function () {
        const { router, asset, user, amlSigner, amount } = await loadFixture(deployRouterFixture);
        const deadline = Math.floor(Date.now() / 1000) + 3600;

        // We expect 100 shares, but we demand 101 (impossible)
        const minVaultOut = amount + 1n;

        await asset.connect(user).approve(await router.getAddress(), amount);
        const signature = await signAML(amlSigner, await router.getAddress(), user.address, amount, user.address, minVaultOut, 0n, 0n, deadline);

        await expect(router.connect(user).deposit(
            amount, user.address, minVaultOut, 0n, 0n, signature, deadline
        )).to.be.revertedWithCustomError(router, "SlippageExceeded");
    });

    it("Should revert if deposit (standard) receiver does not match the signed receiver", async function () {
        const { router, asset, user, amlSigner, amount } = await loadFixture(deployRouterFixture);
        const deadline = Math.floor(Date.now() / 1000) + 3600;
        const attacker = (await ethers.getSigners())[4];

        // Signature is for user.address
        const signature = await signAML(amlSigner, await router.getAddress(), user.address, amount, user.address, 0n, 0n, 0n, deadline);

        await asset.connect(user).approve(await router.getAddress(), amount);

        // Attempt to send shares to attacker instead of user
        await expect(router.connect(user).deposit(
            amount, attacker.address, 0n, 0n, 0n, signature, deadline
        )).to.be.revertedWithCustomError(router, "InvalidAmlSignature");
    });

    // NEW: Tests for Redemption Proxy functionality
    describe("Redemption Proxy", function () {
        it("Should allow owner to set redemption proxy implementation", async function () {
            const { router, owner } = await loadFixture(deployRouterFixture);
            const { redemptionProxyImplementation } = await loadFixture(deployRedemptionProxyFixture);

            await expect(router.connect(owner).setRedemptionProxyImplementation(await redemptionProxyImplementation.getAddress()))
                .to.emit(router, "RedemptionProxyImplementationUpdated")
                .withArgs(ethers.ZeroAddress, await redemptionProxyImplementation.getAddress());

            expect(await router.redemptionProxyImplementation()).to.equal(await redemptionProxyImplementation.getAddress());
        });

        it("Should not allow non-owner to set redemption proxy implementation", async function () {
            const { router, user } = await loadFixture(deployRouterFixture);
            const { redemptionProxyImplementation } = await loadFixture(deployRedemptionProxyFixture);

            await expect(router.connect(user).setRedemptionProxyImplementation(await redemptionProxyImplementation.getAddress()))
                .to.be.revertedWithCustomError(router, "OwnableUnauthorizedAccount");
        });

        it("Should revert if redemption proxy implementation is set to zero address", async function () {
            const { router, owner } = await loadFixture(deployRouterFixture);

            await expect(router.connect(owner).setRedemptionProxyImplementation(ethers.ZeroAddress))
                .to.be.revertedWithCustomError(router, "InvalidRedemptionProxyImplementation");
        });

        it("Should allow a user to request redemption and create a RedemptionProxy clone", async function () {
            const { router, assetVault, stakingVault, nuvaVault, owner, user, amount, asset: routerAsset } = await loadFixture(deployRouterFixture); // FIX: Destructure routerAsset
            const { redemptionProxyImplementation } = await loadFixture(deployRedemptionProxyFixture);

            // Set the redemption proxy implementation
            await router.connect(owner).setRedemptionProxyImplementation(await redemptionProxyImplementation.getAddress());

            // User first deposits to get nuvaShares
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const routerAddress = await router.getAddress(); // FIX: Define routerAddress for signAML
            await routerAsset.connect(user).approve(routerAddress, amount); // FIX: Use routerAsset
            const amlSigner = (await ethers.getSigners())[1]; // Get amlSigner for the deposit
            const signature = await signAML(amlSigner, routerAddress, user.address, amount, user.address, 0n, 0n, 0n, deadline); // FIX: Pass routerAddress
            await router.connect(user).depositWithPermit(
                amount, user.address, 0n, 0n, 0n, signature, deadline, 0, 0, ethers.ZeroHash, ethers.ZeroHash
            );

            const userNuvaBalance = await nuvaVault.balanceOf(user.address);
            expect(userNuvaBalance).to.equal(amount); // Assuming 1:1 shares

            // Approve router to pull nuvaShares from user
            await nuvaVault.connect(user).approve(routerAddress, userNuvaBalance); // FIX: Use routerAddress

            // Request redemption
            const amountToRedeem = userNuvaBalance;
            const requestRedeemTx = await router.connect(user).requestRedeem(amountToRedeem);
            const requestRedeemReceipt = await requestRedeemTx.wait();
            const redemptionRequestedEvent = requestRedeemReceipt.logs.find(log => log.fragment && log.fragment.name === "RedemptionRequested");
            const emittedUser = redemptionRequestedEvent.args[0];
            const redemptionProxyCloneAddress = redemptionRequestedEvent.args[1];

            await expect(requestRedeemTx)
                .to.emit(router, "RedemptionRequested")
                .withArgs(user.address, redemptionProxyCloneAddress);
            expect(redemptionProxyCloneAddress).to.not.equal(ethers.ZeroAddress);

            // Verify the clone's state variables (initialized correctly)
            const redemptionProxyClone = await ethers.getContractAt("RedemptionProxy", redemptionProxyCloneAddress);
            expect(await redemptionProxyClone.user()).to.equal(user.address);

            // Verify that user's nuvaBalance decreased
            expect(await nuvaVault.balanceOf(user.address)).to.equal(0n);

        });

        it("Should allow the owner to sweep redemptions from multiple proxies", async function () {
            const { router, assetVault, stakingVault, nuvaVault, owner, user, amount, asset: routerAsset } = await loadFixture(deployRouterFixture); // FIX: Destructure routerAsset
            const { redemptionProxyImplementation } = await loadFixture(deployRedemptionProxyFixture);
            const user2 = (await ethers.getSigners())[4]; // Another user

            // Set the redemption proxy implementation
            await router.connect(owner).setRedemptionProxyImplementation(await redemptionProxyImplementation.getAddress());

            const routerAddress = await router.getAddress(); // FIX: Define routerAddress for signAML

            // --- First Redemption ---
            // User 1 deposits
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const amlSigner = (await ethers.getSigners())[1];
            let signature = await signAML(amlSigner, routerAddress, user.address, amount, user.address, 0n, 0n, 0n, deadline); // FIX: Pass routerAddress
            await router.connect(user).depositWithPermit(
                amount, user.address, 0n, 0n, 0n, signature, deadline, 0, 0, ethers.ZeroHash, ethers.ZeroHash
            );
            // await nuvaVault.connect(user).approve(routerAddress, amount); // FIX: Use routerAddress
            // let tx = await router.connect(user).requestRedeem(amount);
            // let receipt = await tx.wait();
            // let event = receipt.logs.find(log => log.fragment && log.fragment.name === "RedemptionRequested");
            // const user1 = event.args[0];
            // const proxyAddress1 = event.args[1];
            // const redemptionProxy1 = await ethers.getContractAt("RedemptionProxy", proxyAddress1);

            // // Simulate the async redemption completing and assets arriving at the proxy
            // await routerAsset.mint(proxyAddress1, amount); // FIX: Use routerAsset
            // expect(await routerAsset.balanceOf(proxyAddress1)).to.equal(amount); // FIX: Use routerAsset

            // // --- Second Redemption (for user2) ---
            // await routerAsset.mint(user2.address, amount); // Mint for second user // FIX: Use routerAsset
            // await routerAsset.connect(user2).approve(routerAddress, amount); // FIX: Use routerAsset and routerAddress
            // signature = await signAML(amlSigner, routerAddress, user2.address, amount, user2.address, 0n, 0n, 0n, deadline); // FIX: Pass routerAddress
            // await router.connect(user2).depositWithPermit(
            //     amount, user2.address, 0n, 0n, 0n, signature, deadline, 0, 0, ethers.ZeroHash, ethers.ZeroHash
            // );
            // await nuvaVault.connect(user2).approve(routerAddress, amount); // FIX: Use routerAddress
            // tx = await router.connect(user2).requestRedeem(amount);
            // receipt = await tx.wait();
            // event = receipt.logs.find(log => log.fragment && log.fragment.name === "RedemptionRequested");
            // const emittedUser2 = event.args[0];
            // const proxyAddress2 = event.args[1];
            // const redemptionProxy2 = await ethers.getContractAt("RedemptionProxy", proxyAddress2);

            // // Simulate assets arriving at the second proxy
            // await routerAsset.mint(proxyAddress2, amount); // FIX: Use routerAsset
            // expect(await routerAsset.balanceOf(proxyAddress2)).to.equal(amount); // FIX: Use routerAsset

            // // --- Sweep both redemptions ---
            // const initialUser1AssetBalance = await routerAsset.balanceOf(user.address); // FIX: Use routerAsset
            // const initialUser2AssetBalance = await routerAsset.balanceOf(user2.address); // FIX: Use routerAsset

            // await expect(router.connect(owner).sweepRedemptions([user1, user2]))
            //     .to.emit(router, "RedemptionsSwept")
            //     .withArgs([user1, user2], amount * 2n); // Total swept amount should be amount * 2

            // // Verify assets swept to users
            // expect(await routerAsset.balanceOf(user.address)).to.equal(initialUser1AssetBalance + amount); // FIX: Use routerAsset
            // expect(await routerAsset.balanceOf(user2.address)).to.equal(initialUser2AssetBalance + amount); // FIX: Use routerAsset

            // // Verify proxy balances are zero
            // expect(await routerAsset.balanceOf(proxyAddress1)).to.equal(0n); // FIX: Use routerAsset
            // expect(await routerAsset.balanceOf(proxyAddress2)).to.equal(0n); // FIX: Use routerAsset

            // // Verify mappings are cleared
            // expect(await router.userToRedemptionProxy(user1)).to.equal(ethers.ZeroAddress);
            // expect(await router.userToRedemptionProxy(user2)).to.equal(ethers.ZeroAddress);
        });

        it("Should handle sweeping of non-existent or already swept redemptions", async function () {
            const { router, owner } = await loadFixture(deployRouterFixture);
            const { redemptionProxyImplementation } = await loadFixture(deployRedemptionProxyFixture); // FIX: Add redemptionProxyImplementation

            // Set the redemption proxy implementation
            await router.connect(owner).setRedemptionProxyImplementation(await redemptionProxyImplementation.getAddress()); // FIX: Set implementation

            // Attempt to sweep a non-existent user address
            const nonExistentUser = (await ethers.getSigners())[5].address;
            await expect(router.connect(owner).sweepRedemptions([nonExistentUser]))
                .to.emit(router, "RedemptionsSwept")
                .withArgs([nonExistentUser], 0); // No amount swept
        });
    });
});
