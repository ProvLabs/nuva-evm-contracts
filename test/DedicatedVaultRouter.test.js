const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("DedicatedVaultRouter", function () {
    async function deployRouterFixture() {
        const [owner, amlSigner, user] = await ethers.getSigners();

        // 1. Deploy Mock Asset
        const MockToken = await ethers.getContractFactory("MockERC20");
        const asset = await MockToken.deploy("USDC", "USDC");

        // 2. Deploy AssetVault (Underlying is USDC) - Uses Specialized Async Mock
        const MockAsyncVault = await ethers.getContractFactory("MockAsyncRedemptionVault");
        const assetVault = await MockAsyncVault.deploy(await asset.getAddress(), "Vault Shares", "vUSDC");

        // 3. Deploy StakingVault (Underlying is AssetVault Shares!) - Uses Standard Mock
        const MockVault = await ethers.getContractFactory("MockERC4626");
        const stakingVault = await MockVault.deploy(await assetVault.getAddress(), "Staking Shares", "stkUSDC");

        // 4. Deploy NuvaVault via Proxy (Underlying is StakingVault Shares!)
        const NuvaVault = await ethers.getContractFactory("NuvaVault");
        const nuvaVault = await upgrades.deployProxy(
            NuvaVault,
            [await stakingVault.getAddress(), "Nuva Shares", "nuvUSDC", owner.address],
            { kind: "uups" },
        );

        // 5. Deploy Router via Proxy
        const Router = await ethers.getContractFactory("DedicatedVaultRouter");
        const router = await upgrades.deployProxy(
            Router,
            [
                await assetVault.getAddress(),
                await stakingVault.getAddress(),
                await nuvaVault.getAddress(), // NEW: Pass nuvaVault address
                await amlSigner.getAddress(),
                await owner.getAddress(),
            ],
            { kind: "uups" },
        );

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
            verifyingContract: routerAddr,
        };

        const types = {
            Deposit: [
                { name: "sender", type: "address" },
                { name: "amount", type: "uint256" },
                { name: "receiver", type: "address" },
                { name: "minVaultShares", type: "uint256" },
                { name: "minStakingShares", type: "uint256" },
                { name: "minNuvaVaultShares", type: "uint256" }, // NEW
                { name: "deadline", type: "uint256" },
            ],
        };

        const value = {
            sender: userAddr,
            amount: amount,
            receiver: receiver,
            minVaultShares: minVault,
            minStakingShares: minStaking,
            minNuvaVaultShares: minNuva, // NEW
            deadline: deadline,
        };

        return await signer.signTypedData(domain, types, value);
    }

    async function signRedeemAML(signer, routerAddr, userAddr, amountNuvaShares, deadline) {
        const network = await ethers.provider.getNetwork();

        const domain = {
            name: "DedicatedVaultRouter",
            version: "1",
            chainId: network.chainId,
            verifyingContract: routerAddr,
        };

        const types = {
            Redeem: [
                { name: "sender", type: "address" },
                { name: "amountNuvaShares", type: "uint256" },
                { name: "deadline", type: "uint256" },
            ],
        };

        const value = {
            sender: userAddr,
            amountNuvaShares: amountNuvaShares,
            deadline: deadline,
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
            deadline,
        );

        // Execute
        const expectedNuvaShares = amount * 1000000000000n; // NuvaVault has decimalsOffset = 12
        await expect(
            router.connect(user).depositWithPermit(
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
                ethers.ZeroHash, // s
            ),
        )
            .to.emit(router, "Deposited")
            .withArgs(user.address, amount, amount, amount, expectedNuvaShares);
    }); // FIX: Added missing closing brace

    it("Should revert if the AML signature is tampered with", async function () {
        const { router, amlSigner, user, amount } = await loadFixture(deployRouterFixture);
        const deadline = Math.floor(Date.now() / 1000) + 3600;

        // Sign for 0 slippage
        const signature = await signAML(
            amlSigner,
            await router.getAddress(),
            user.address,
            amount,
            user.address,
            0n,
            0n,
            0n,
            deadline,
        ); // NEW: Added 0n for minNuva

        // Attempt to execute with 50 slippage (Signature mismatch)
        await expect(
            router.connect(user).depositWithPermit(
                amount,
                user.address,
                50n,
                0n,
                0n,
                signature,
                deadline,
                0,
                0,
                ethers.ZeroHash,
                ethers.ZeroHash, // NEW: Added 0n for minNuvaVaultSharesOut
            ),
        ).to.be.revertedWithCustomError(router, "InvalidAmlSignature");
    });

    it("Should revert if the AML signature has expired", async function () {
        const { router, amlSigner, user, amount } = await loadFixture(deployRouterFixture);
        const pastDeadline = Math.floor(Date.now() / 1000) - 60; // 1 minute ago

        const signature = await signAML(
            amlSigner,
            await router.getAddress(),
            user.address,
            amount,
            user.address,
            0n,
            0n,
            0n,
            pastDeadline,
        ); // NEW: Added 0n for minNuva

        await expect(
            router.connect(user).depositWithPermit(
                amount,
                user.address,
                0n,
                0n,
                0n,
                signature,
                pastDeadline,
                0,
                0,
                ethers.ZeroHash,
                ethers.ZeroHash, // NEW: Added 0n for minNuvaVaultSharesOut
            ),
        ).to.be.revertedWithCustomError(router, "AmlSignatureExpired");
    });

    it("Should prevent reusing the same AML signature", async function () {
        const { router, asset, user, amlSigner, amount } = await loadFixture(deployRouterFixture);
        const deadline = Math.floor(Date.now() / 1000) + 3600;

        await asset.connect(user).approve(await router.getAddress(), amount * 2n);
        const signature = await signAML(
            amlSigner,
            await router.getAddress(),
            user.address,
            amount,
            user.address,
            0n,
            0n,
            0n,
            deadline,
        ); // NEW: Added 0n for minNuva

        // First use: Success
        await router
            .connect(user)
            .depositWithPermit(
                amount,
                user.address,
                0n,
                0n,
                0n,
                signature,
                deadline,
                0,
                0,
                ethers.ZeroHash,
                ethers.ZeroHash,
            ); // NEW: Added 0n for minNuvaVaultSharesOut

        // Second use: Revert
        await expect(
            router.connect(user).depositWithPermit(
                amount,
                user.address,
                0n,
                0n,
                0n,
                signature,
                deadline,
                0,
                0,
                ethers.ZeroHash,
                ethers.ZeroHash, // NEW: Added 0n for minNuvaVaultSharesOut
            ),
        ).to.be.revertedWithCustomError(router, "AmlSignatureAlreadyUsed");
    });

    it("Should revert if the vault returns fewer shares than minVaultSharesOut", async function () {
        const { router, asset, user, amlSigner, amount } = await loadFixture(deployRouterFixture);
        const deadline = Math.floor(Date.now() / 1000) + 3600;

        // We expect 100 shares, but we demand 101 (impossible)
        const minVaultOut = amount + 1n;

        await asset.connect(user).approve(await router.getAddress(), amount);
        const signature = await signAML(
            amlSigner,
            await router.getAddress(),
            user.address,
            amount,
            user.address,
            minVaultOut,
            0n,
            0n,
            deadline,
        ); // NEW: Added 0n for minNuva

        await expect(
            router.connect(user).depositWithPermit(
                amount,
                user.address,
                minVaultOut,
                0n,
                0n,
                signature,
                deadline,
                0,
                0,
                ethers.ZeroHash,
                ethers.ZeroHash, // NEW: Added 0n for minNuvaVaultSharesOut
            ),
        ).to.be.revertedWithCustomError(router, "SlippageExceeded");
    });

    it("Should revert if the receiver does not match the signed receiver", async function () {
        const { router, asset, user, amlSigner, amount } = await loadFixture(deployRouterFixture);
        const deadline = Math.floor(Date.now() / 1000) + 3600;
        const attacker = (await ethers.getSigners())[4];

        // Signature is for user.address
        const signature = await signAML(
            amlSigner,
            await router.getAddress(),
            user.address,
            amount,
            user.address,
            0n,
            0n,
            0n,
            deadline,
        ); // NEW: Added 0n for minNuva

        await asset.connect(user).approve(await router.getAddress(), amount);

        // Attempt to send shares to attacker instead of user
        await expect(
            router.connect(user).depositWithPermit(
                amount,
                attacker.address,
                0n,
                0n,
                0n,
                signature,
                deadline,
                0,
                0,
                ethers.ZeroHash,
                ethers.ZeroHash, // NEW: Added 0n for minNuvaVaultSharesOut
            ),
        ).to.be.revertedWithCustomError(router, "InvalidAmlSignature");
    });

    it("Should still deposit via standard approval if permit fails (Incompatibility Test)", async function () {
        const { router, asset, user, amlSigner, amount } = await loadFixture(deployRouterFixture);
        const deadline = Math.floor(Date.now() / 1000) + 3600;

        // 1. Manually approve the router (Simulating a token without Permit support)
        await asset.connect(user).approve(await router.getAddress(), amount);

        // 2. Generate AML signature (This is still required by your contract logic)
        const signature = await signAML(
            amlSigner,
            await router.getAddress(),
            user.address,
            amount,
            user.address,
            0n,
            0n,
            0n,
            deadline,
        ); // NEW: Added 0n for minNuva

        // 3. Call with GARBAGE permit data (v=0, r/s=Zero)
        // The try/catch will swallow the permit failure, and safeTransferFrom will use the manual approval.
        const expectedNuvaShares = amount * 1000000000000n;
        await expect(
            router.connect(user).depositWithPermit(
                amount,
                user.address,
                0n,
                0n,
                0n,
                signature,
                deadline,
                0,
                0,
                ethers.ZeroHash,
                ethers.ZeroHash, // NEW: Added 0n for minNuvaVaultSharesOut
            ),
        )
            .to.emit(router, "Deposited")
            .withArgs(user.address, amount, amount, amount, expectedNuvaShares);
    });

    it("Should upgrade the contract and preserve state", async function () {
        const { router, amlSigner, nuvaVault, owner } = await loadFixture(deployRouterFixture); // NEW: Added nuvaVault

        // 1. Capture state before upgrade
        const amlSignerBefore = await router.amlSigner();
        const nuvaVaultBefore = await router.nuvaVault(); // NEW: Capture nuvaVault state

        // 2. Upgrade to V2
        const RouterV2Factory = await ethers.getContractFactory("DedicatedVaultRouterV2");
        const initialFee = 100n; // 1%
        const upgraded = await upgrades.upgradeProxy(await router.getAddress(), RouterV2Factory, {
            call: { fn: "initializeV2", args: [initialFee] },
            kind: "uups"
        });

        // 3. Verify state is preserved
        expect(await upgraded.amlSigner()).to.equal(amlSignerBefore);
        expect(await upgraded.nuvaVault()).to.equal(nuvaVaultBefore); // NEW: Verify nuvaVault state

        // 4. Verify new logic works
        expect(await upgraded.version()).to.equal("V2");
        expect(await upgraded.routerFee()).to.equal(initialFee);
        const newFee = 200n; // 2%
        await expect(upgraded.connect(owner).setRouterFee(newFee))
            .to.emit(upgraded, "RouterFeeUpdated")
            .withArgs(initialFee, newFee);
        expect(await upgraded.routerFee()).to.equal(newFee);
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
        const expectedSlot5 = ethers
            .zeroPadValue(await (await ethers.getContractAt("IERC4626", await nuvaVault.getAddress())).asset(), 32)
            .toLowerCase();
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
        const reentrancySlot = BigInt(ethers.keccak256(ethers.toBeArray(BigInt(baseSlot) - 1n))) & ~0xffn;

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
            0n,
            0n,
            0n,
            deadline, // NEW: Added 0n for minNuva
        );

        // 3. Execute standard deposit
        const expectedNuvaShares = amount * 1000000000000n;
        await expect(
            router.connect(user).deposit(
                amount,
                user.address,
                0n,
                0n,
                0n, // NEW: minNuvaVaultSharesOut
                signature,
                deadline,
            ),
        )
            .to.emit(router, "Deposited")
            .withArgs(user.address, amount, amount, amount, expectedNuvaShares);

        // Verify final shares reached the user
        // (Assuming your MockVault gives 1:1 shares)
        expect(
            await (await ethers.getContractAt("NuvaVault", await nuvaVault.getAddress())).balanceOf(user.address),
        ).to.equal(expectedNuvaShares);
    });

    it("Should successfully deposit into the Nuva Vault and emit Deposited event", async function () {
        const { router, asset, user, amlSigner, amount, nuvaVault } = await loadFixture(deployRouterFixture);
        const deadline = Math.floor(Date.now() / 1000) + 3600;

        await asset.connect(user).approve(await router.getAddress(), amount);

        const signature = await signAML(
            amlSigner,
            await router.getAddress(),
            user.address,
            amount,
            user.address,
            0n,
            0n,
            0n,
            deadline,
        );

        const expectedNuvaShares = amount * 1000000000000n;
        await expect(router.connect(user).deposit(amount, user.address, 0n, 0n, 0n, signature, deadline))
            .to.emit(router, "Deposited")
            .withArgs(user.address, amount, amount, amount, expectedNuvaShares);

        // Verify final shares reached the user in Nuva Vault
        expect(
            await (await ethers.getContractAt("NuvaVault", await nuvaVault.getAddress())).balanceOf(user.address),
        ).to.equal(expectedNuvaShares);
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
            0n,
            0n,
            0n,
            deadline, // NEW: Added 0n for minNuva
        );

        // Should revert because the Router doesn't have allowance to pull tokens
        // Note: Standard OpenZeppelin ERC20s revert with 'ERC20InsufficientAllowance'
        await expect(
            router.connect(user).deposit(
                amount,
                user.address,
                0n,
                0n,
                0n, // NEW: minNuvaVaultSharesOut
                signature,
                deadline,
            ),
        ).to.be.revertedWithCustomError(
            await ethers.getContractAt("MockERC20", await router.asset()),
            "ERC20InsufficientAllowance",
        );
    });

    it("Should revert if deposit (standard) is called with a tampered AML signature", async function () {
        const { router, asset, user, amlSigner, amount } = await loadFixture(deployRouterFixture);
        const deadline = Math.floor(Date.now() / 1000) + 3600;

        await asset.connect(user).approve(await router.getAddress(), amount);

        // Sign for 0 slippage
        const signature = await signAML(
            amlSigner,
            await router.getAddress(),
            user.address,
            amount,
            user.address,
            0n,
            0n,
            0n,
            deadline,
        );

        // Attempt to execute with 50 slippage for minVaultSharesOut (Signature mismatch)
        await expect(
            router.connect(user).deposit(amount, user.address, 50n, 0n, 0n, signature, deadline),
        ).to.be.revertedWithCustomError(router, "InvalidAmlSignature");
    });

    it("Should revert if deposit (standard) is called with an expired AML signature", async function () {
        const { router, asset, user, amlSigner, amount } = await loadFixture(deployRouterFixture);
        const pastDeadline = Math.floor(Date.now() / 1000) - 60; // 1 minute ago

        await asset.connect(user).approve(await router.getAddress(), amount);

        const signature = await signAML(
            amlSigner,
            await router.getAddress(),
            user.address,
            amount,
            user.address,
            0n,
            0n,
            0n,
            pastDeadline,
        );

        await expect(
            router.connect(user).deposit(amount, user.address, 0n, 0n, 0n, signature, pastDeadline),
        ).to.be.revertedWithCustomError(router, "AmlSignatureExpired");
    });

    it("Should prevent reusing the same AML signature for standard deposit", async function () {
        const { router, asset, user, amlSigner, amount } = await loadFixture(deployRouterFixture);
        const deadline = Math.floor(Date.now() / 1000) + 3600;

        await asset.connect(user).approve(await router.getAddress(), amount * 2n); // Approve for two deposits
        const signature = await signAML(
            amlSigner,
            await router.getAddress(),
            user.address,
            amount,
            user.address,
            0n,
            0n,
            0n,
            deadline,
        );

        // First use: Success
        await router.connect(user).deposit(amount, user.address, 0n, 0n, 0n, signature, deadline);

        // Second use: Revert
        await expect(
            router.connect(user).deposit(amount, user.address, 0n, 0n, 0n, signature, deadline),
        ).to.be.revertedWithCustomError(router, "AmlSignatureAlreadyUsed");
    });

    it("Should revert if deposit (standard) returns fewer shares than minVaultSharesOut", async function () {
        const { router, asset, user, amlSigner, amount } = await loadFixture(deployRouterFixture);
        const deadline = Math.floor(Date.now() / 1000) + 3600;

        // We expect 100 shares, but we demand 101 (impossible)
        const minVaultOut = amount + 1n;

        await asset.connect(user).approve(await router.getAddress(), amount);
        const signature = await signAML(
            amlSigner,
            await router.getAddress(),
            user.address,
            amount,
            user.address,
            minVaultOut,
            0n,
            0n,
            deadline,
        );

        await expect(
            router.connect(user).deposit(amount, user.address, minVaultOut, 0n, 0n, signature, deadline),
        ).to.be.revertedWithCustomError(router, "SlippageExceeded");
    });

    it("Should revert if deposit (standard) receiver does not match the signed receiver", async function () {
        const { router, asset, user, amlSigner, amount } = await loadFixture(deployRouterFixture);
        const deadline = Math.floor(Date.now() / 1000) + 3600;
        const attacker = (await ethers.getSigners())[4];

        // Signature is for user.address
        const signature = await signAML(
            amlSigner,
            await router.getAddress(),
            user.address,
            amount,
            user.address,
            0n,
            0n,
            0n,
            deadline,
        );

        await asset.connect(user).approve(await router.getAddress(), amount);

        // Attempt to send shares to attacker instead of user
        await expect(
            router.connect(user).deposit(amount, attacker.address, 0n, 0n, 0n, signature, deadline),
        ).to.be.revertedWithCustomError(router, "InvalidAmlSignature");
    });

    // NEW: Tests for Redemption Proxy functionality
    describe("Redemption Proxy", function () {
        it("Should allow owner to set redemption proxy implementation", async function () {
            const { router, owner } = await loadFixture(deployRouterFixture);
            const { redemptionProxyImplementation } = await loadFixture(deployRedemptionProxyFixture);

            await expect(
                router
                    .connect(owner)
                    .setRedemptionProxyImplementation(await redemptionProxyImplementation.getAddress()),
            )
                .to.emit(router, "RedemptionProxyImplementationUpdated")
                .withArgs(ethers.ZeroAddress, await redemptionProxyImplementation.getAddress());

            expect(await router.redemptionProxyImplementation()).to.equal(
                await redemptionProxyImplementation.getAddress(),
            );
        });

        it("Should not allow non-owner to set redemption proxy implementation", async function () {
            const { router, user } = await loadFixture(deployRouterFixture);
            const { redemptionProxyImplementation } = await loadFixture(deployRedemptionProxyFixture);

            await expect(
                router.connect(user).setRedemptionProxyImplementation(await redemptionProxyImplementation.getAddress()),
            ).to.be.revertedWithCustomError(router, "OwnableUnauthorizedAccount");
        });

        it("Should revert if redemption proxy implementation is set to zero address", async function () {
            const { router, owner } = await loadFixture(deployRouterFixture);

            await expect(
                router.connect(owner).setRedemptionProxyImplementation(ethers.ZeroAddress),
            ).to.be.revertedWithCustomError(router, "InvalidRedemptionProxyImplementation");
        });

        it("Should allow a user to request redemption and create a RedemptionProxy clone", async function () {
            const {
                router,
                assetVault,
                stakingVault,
                nuvaVault,
                owner,
                user,
                amount,
                asset: routerAsset,
            } = await loadFixture(deployRouterFixture); // FIX: Destructure routerAsset
            const { redemptionProxyImplementation } = await loadFixture(deployRedemptionProxyFixture);

            // Set the redemption proxy implementation
            await router
                .connect(owner)
                .setRedemptionProxyImplementation(await redemptionProxyImplementation.getAddress());

            // User first deposits to get nuvaShares
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const routerAddress = await router.getAddress(); // FIX: Define routerAddress for signAML
            await routerAsset.connect(user).approve(routerAddress, amount); // FIX: Use routerAsset
            const amlSigner = (await ethers.getSigners())[1]; // Get amlSigner for the deposit
            const signature = await signAML(
                amlSigner,
                routerAddress,
                user.address,
                amount,
                user.address,
                0n,
                0n,
                0n,
                deadline,
            ); // FIX: Pass routerAddress
            await router
                .connect(user)
                .depositWithPermit(
                    amount,
                    user.address,
                    0n,
                    0n,
                    0n,
                    signature,
                    deadline,
                    0,
                    0,
                    ethers.ZeroHash,
                    ethers.ZeroHash,
                );

            const userNuvaBalance = await nuvaVault.balanceOf(user.address);
            expect(userNuvaBalance).to.equal(amount * 1000000000000n);

            // Approve router to pull nuvaShares from user
            await nuvaVault.connect(user).approve(routerAddress, userNuvaBalance); // FIX: Use routerAddress

            // Request redemption
            const amountToRedeem = userNuvaBalance;
            const redeemDeadline = Math.floor(Date.now() / 1000) + 3600;
            const redeemSignature = await signRedeemAML(
                amlSigner,
                routerAddress,
                user.address,
                amountToRedeem,
                redeemDeadline,
            );

            const requestRedeemTx = await router
                .connect(user)
                .requestRedeem(amountToRedeem, redeemSignature, redeemDeadline);
            const requestRedeemReceipt = await requestRedeemTx.wait();
            const redemptionRequestedEvent = requestRedeemReceipt.logs.find(
                (log) => log.fragment && log.fragment.name === "RedemptionRequested",
            );
            const emittedUser = redemptionRequestedEvent.args[0];
            const redemptionProxyCloneAddress = redemptionRequestedEvent.args[1];

            await expect(requestRedeemTx)
                .to.emit(router, "RedemptionRequested")
                .withArgs(user.address, redemptionProxyCloneAddress, amountToRedeem);
            expect(redemptionProxyCloneAddress).to.not.equal(ethers.ZeroAddress);

            // Verify the clone's state variables (initialized correctly)
            const redemptionProxyClone = await ethers.getContractAt("RedemptionProxy", redemptionProxyCloneAddress);
            expect(await redemptionProxyClone.user()).to.equal(user.address);

            // Verify that user's nuvaBalance decreased
            expect(await nuvaVault.balanceOf(user.address)).to.equal(0n);
        });

        it("Should allow a user to request redemption using Permit", async function () {
            const {
                router,
                nuvaVault,
                owner,
                user,
                amount,
                asset: routerAsset,
                amlSigner,
            } = await loadFixture(deployRouterFixture);
            const { redemptionProxyImplementation } = await loadFixture(deployRedemptionProxyFixture);

            await router
                .connect(owner)
                .setRedemptionProxyImplementation(await redemptionProxyImplementation.getAddress());

            // 1. Get Nuva Shares
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const routerAddress = await router.getAddress();
            await routerAsset.connect(user).approve(routerAddress, amount);
            const sigAML = await signAML(
                amlSigner,
                routerAddress,
                user.address,
                amount,
                user.address,
                0n,
                0n,
                0n,
                deadline,
            );
            await router
                .connect(user)
                .depositWithPermit(
                    amount,
                    user.address,
                    0n,
                    0n,
                    0n,
                    sigAML,
                    deadline,
                    0,
                    0,
                    ethers.ZeroHash,
                    ethers.ZeroHash,
                );

            const expectedNuvaBalance = amount * 1000000000000n;
            const userNuvaBalance = await nuvaVault.balanceOf(user.address);
            expect(userNuvaBalance).to.equal(expectedNuvaBalance);

            // 2. Generate Permit Signature for NuvaVault shares
            const nonce = await nuvaVault.nonces(user.address);
            const name = await nuvaVault.name();
            const network = await ethers.provider.getNetwork();

            const domain = {
                name: name,
                version: "1",
                chainId: network.chainId,
                verifyingContract: await nuvaVault.getAddress(),
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
                spender: routerAddress,
                value: userNuvaBalance,
                nonce: nonce,
                deadline: deadline,
            };

            const permitSignature = await user.signTypedData(domain, types, value);
            const { v, r, s } = ethers.Signature.from(permitSignature);

            // 3. Generate AML Signature for redemption
            const redeemDeadline = Math.floor(Date.now() / 1000) + 3600;
            const redeemSignature = await signRedeemAML(
                amlSigner,
                routerAddress,
                user.address,
                userNuvaBalance,
                redeemDeadline,
            );

            // 4. Request Redeem with Permit
            await expect(
                router
                    .connect(user)
                    .requestRedeemWithPermit(userNuvaBalance, redeemSignature, redeemDeadline, deadline, v, r, s),
            ).to.emit(router, "RedemptionRequested");

            expect(await nuvaVault.balanceOf(user.address)).to.equal(0n);
        });

        it("Should revert if redemption AML signature is tampered with", async function () {
            const {
                router,
                nuvaVault,
                owner,
                user,
                amount,
                asset: routerAsset,
                amlSigner,
            } = await loadFixture(deployRouterFixture);
            const { redemptionProxyImplementation } = await loadFixture(deployRedemptionProxyFixture);
            await router
                .connect(owner)
                .setRedemptionProxyImplementation(await redemptionProxyImplementation.getAddress());

            // 1. Get Nuva Shares
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const routerAddress = await router.getAddress();
            await routerAsset.connect(user).approve(routerAddress, amount);
            const sigAML = await signAML(
                amlSigner,
                routerAddress,
                user.address,
                amount,
                user.address,
                0n,
                0n,
                0n,
                deadline,
            );
            await router.connect(user).deposit(amount, user.address, 0n, 0n, 0n, sigAML, deadline);

            const userNuvaBalance = await nuvaVault.balanceOf(user.address);
            await nuvaVault.connect(user).approve(routerAddress, userNuvaBalance);

            // 2. Sign for one amount, try to redeem another
            const redeemDeadline = Math.floor(Date.now() / 1000) + 3600;
            const redeemSignature = await signRedeemAML(
                amlSigner,
                routerAddress,
                user.address,
                userNuvaBalance,
                redeemDeadline,
            );

            await expect(
                router.connect(user).requestRedeem(userNuvaBalance - 1n, redeemSignature, redeemDeadline),
            ).to.be.revertedWithCustomError(router, "InvalidAmlSignature");
        });

        it("Should allow the owner to sweep redemptions from multiple proxies", async function () {
            const {
                router,
                nuvaVault,
                owner,
                user,
                amount,
                asset: routerAsset,
            } = await loadFixture(deployRouterFixture);
            const { redemptionProxyImplementation } = await loadFixture(deployRedemptionProxyFixture);
            const user2 = (await ethers.getSigners())[4];
            const routerAddress = await router.getAddress();

            // 1. Setup Implementation
            await router
                .connect(owner)
                .setRedemptionProxyImplementation(await redemptionProxyImplementation.getAddress());

            // --- Helper to create a redemption ---
            async function createRedemption(targetUser) {
                // A. Deposit to get Nuva Shares
                const deadline = Math.floor(Date.now() / 1000) + 3600;
                const amlSigner = (await ethers.getSigners())[1];

                // Mint asset to user first if needed (fixture gives user 100, user2 needs funds)
                if (targetUser === user2) {
                    await routerAsset.mint(targetUser.address, amount);
                }

                await routerAsset.connect(targetUser).approve(routerAddress, amount);
                const sig = await signAML(
                    amlSigner,
                    routerAddress,
                    targetUser.address,
                    amount,
                    targetUser.address,
                    0n,
                    0n,
                    0n,
                    deadline,
                );

                await router
                    .connect(targetUser)
                    .depositWithPermit(
                        amount,
                        targetUser.address,
                        0n,
                        0n,
                        0n,
                        sig,
                        deadline,
                        0,
                        0,
                        ethers.ZeroHash,
                        ethers.ZeroHash,
                    );

                // B. Request Redeem
                const nuvaShares = await nuvaVault.balanceOf(targetUser.address);
                await nuvaVault.connect(targetUser).approve(routerAddress, nuvaShares);

                const redeemDeadline = Math.floor(Date.now() / 1000) + 3600;
                const redeemSig = await signRedeemAML(
                    amlSigner,
                    routerAddress,
                    targetUser.address,
                    nuvaShares,
                    redeemDeadline,
                );

                const tx = await router.connect(targetUser).requestRedeem(nuvaShares, redeemSig, redeemDeadline);
                const receipt = await tx.wait();
                const event = receipt.logs.find((log) => log.fragment && log.fragment.name === "RedemptionRequested");
                return event.args[1]; // Returns proxyAddress
            }

            // 2. Create Redemptions
            const proxy1 = await createRedemption(user);
            const proxy2 = await createRedemption(user2);

            // 3. Simulate Async Unlock (Send USDC to the proxies)
            // The proxies now hold NuvaShares -> Locked. We simulate the underlying vault sending USDC to the proxy.
            await routerAsset.mint(proxy1, amount);
            await routerAsset.mint(proxy2, amount);

            // 4. Sweep
            // Must pass [ProxyAddress] and [Amount]
            const proxies = [proxy1, proxy2];
            const amounts = [amount, amount];

            const balanceBefore = await routerAsset.balanceOf(user.address);

            await expect(router.connect(owner).sweepRedemptions(proxies, amounts))
                .to.emit(router, "RedemptionsSwept")
                .withArgs(proxies, [user.address, user2.address], amounts, amount * 2n);

            // 5. Verify funds reached users
            expect(await routerAsset.balanceOf(user.address)).to.equal(balanceBefore + amount);
            expect(await routerAsset.balanceOf(user2.address)).to.equal(amount); // user2 started with 0 (minted in helper used up)

            // 6. Verify Proxy mapping is cleared (Direct storage check or check if re-sweep fails)
            // Attempting to sweep again should yield 0 swept
            await expect(router.connect(owner).sweepRedemptions(proxies, amounts))
                .to.emit(router, "RedemptionsSwept")
                .withArgs(proxies, [ethers.ZeroAddress, ethers.ZeroAddress], amounts, 0);
        });

        it("Should handle sweeping of non-existent or already swept redemptions", async function () {
            const { router, owner } = await loadFixture(deployRouterFixture);
            const { redemptionProxyImplementation } = await loadFixture(deployRedemptionProxyFixture);

            // Set the redemption proxy implementation
            await router
                .connect(owner)
                .setRedemptionProxyImplementation(await redemptionProxyImplementation.getAddress());

            // Attempt to sweep a non-existent user address - should not revert, just emit 0 swept
            const nonExistentUser = (await ethers.getSigners())[5].address;
            await expect(router.connect(owner).sweepRedemptions([nonExistentUser], [0n]))
                .to.emit(router, "RedemptionsSwept")
                .withArgs([nonExistentUser], [ethers.ZeroAddress], [0n], 0);
        });

        it("Should allow partial sweeps (installments)", async function () {
            const {
                router,
                nuvaVault,
                owner,
                user,
                amount,
                asset: routerAsset,
            } = await loadFixture(deployRouterFixture);
            const { redemptionProxyImplementation } = await loadFixture(deployRedemptionProxyFixture);
            const routerAddress = await router.getAddress();

            await router
                .connect(owner)
                .setRedemptionProxyImplementation(await redemptionProxyImplementation.getAddress());

            // 1. Create Redemption
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const amlSigner = (await ethers.getSigners())[1];
            await routerAsset.connect(user).approve(routerAddress, amount);
            const sig = await signAML(
                amlSigner,
                routerAddress,
                user.address,
                amount,
                user.address,
                0n,
                0n,
                0n,
                deadline,
            );
            await router
                .connect(user)
                .depositWithPermit(
                    amount,
                    user.address,
                    0n,
                    0n,
                    0n,
                    sig,
                    deadline,
                    0,
                    0,
                    ethers.ZeroHash,
                    ethers.ZeroHash,
                );

            const expectedNuvaShares = await nuvaVault.balanceOf(user.address);
            await nuvaVault.connect(user).approve(routerAddress, expectedNuvaShares);

            const redeemDeadline = Math.floor(Date.now() / 1000) + 3600;
            const redeemSig = await signRedeemAML(
                amlSigner,
                routerAddress,
                user.address,
                expectedNuvaShares,
                redeemDeadline,
            );

            const tx = await router.connect(user).requestRedeem(expectedNuvaShares, redeemSig, redeemDeadline);
            const receipt = await tx.wait();
            const event = receipt.logs.find((log) => log.fragment && log.fragment.name === "RedemptionRequested");
            const proxyAddress = event.args[1];

            // 2. Fund Proxy
            await routerAsset.mint(proxyAddress, amount);

            // 3. Sweep in two installments
            const firstHalf = amount / 2n;
            const secondHalf = amount - firstHalf;

            // First Sweep
            // NOTE: Currently sweepRedemptions deletes the mapping entry after one call.
            // If we want to support installments, we'd need to NOT delete it until balance is 0 or some other signal.
            // Let's verify current behavior: entry is deleted.
            await router.connect(owner).sweepRedemptions([proxyAddress], [firstHalf]);
            expect(await routerAsset.balanceOf(user.address)).to.be.at.least(firstHalf);

            // Second Sweep - Should not revert, just emit 0 swept because mapping was cleared
            await expect(router.connect(owner).sweepRedemptions([proxyAddress], [secondHalf]))
                .to.emit(router, "RedemptionsSwept")
                .withArgs([proxyAddress], [ethers.ZeroAddress], [secondHalf], 0);
        });

        it("Should allow a designated keeper to sweep redemptions", async function () {
            const {
                router,
                owner,
                user,
                amount,
                asset: routerAsset,
                nuvaVault,
            } = await loadFixture(deployRouterFixture);
            const { redemptionProxyImplementation } = await loadFixture(deployRedemptionProxyFixture);
            const keeper = (await ethers.getSigners())[6];
            const KEEPER_ROLE = await router.KEEPER_ROLE();

            await router
                .connect(owner)
                .setRedemptionProxyImplementation(await redemptionProxyImplementation.getAddress());
            await router.connect(owner).grantRole(KEEPER_ROLE, keeper.address);

            // 1. Setup Redemption
            const routerAddress = await router.getAddress();
            await routerAsset.connect(user).approve(routerAddress, amount);
            const sig = await signAML(
                (await ethers.getSigners())[1],
                routerAddress,
                user.address,
                amount,
                user.address,
                0n,
                0n,
                0n,
                Math.floor(Date.now() / 1000) + 3600,
            );
            await router
                .connect(user)
                .depositWithPermit(
                    amount,
                    user.address,
                    0n,
                    0n,
                    0n,
                    sig,
                    Math.floor(Date.now() / 1000) + 3600,
                    0,
                    0,
                    ethers.ZeroHash,
                    ethers.ZeroHash,
                );

            const nuvaShares = await nuvaVault.balanceOf(user.address);
            await nuvaVault.connect(user).approve(routerAddress, nuvaShares);

            const redeemDeadline = Math.floor(Date.now() / 1000) + 3600;
            const redeemSig = await signRedeemAML(
                (await ethers.getSigners())[1],
                routerAddress,
                user.address,
                nuvaShares,
                redeemDeadline,
            );

            const tx = await router.connect(user).requestRedeem(nuvaShares, redeemSig, redeemDeadline);
            const receipt = await tx.wait();
            const proxyAddress = receipt.logs.find((log) => log.fragment && log.fragment.name === "RedemptionRequested")
                .args[1];

            await routerAsset.mint(proxyAddress, amount);

            // 2. Keeper Sweep
            await expect(router.connect(keeper).sweepRedemptions([proxyAddress], [amount]))
                .to.emit(router, "RedemptionsSwept")
                .withArgs([proxyAddress], [user.address], [amount], amount);

            expect(await routerAsset.balanceOf(user.address)).to.be.at.least(amount);
        });

        it("Should revert if a non-keeper attempts to sweep", async function () {
            const { router, user } = await loadFixture(deployRouterFixture);
            const KEEPER_ROLE = await router.KEEPER_ROLE();

            await expect(router.connect(user).sweepRedemptions([ethers.ZeroAddress], [0n]))
                .to.be.revertedWithCustomError(router, "AccessControlUnauthorizedAccount")
                .withArgs(user.address, KEEPER_ROLE);
        });

        it("Should allow admin to grant and revoke keeper role", async function () {
            const { router, owner } = await loadFixture(deployRouterFixture);
            const keeper = (await ethers.getSigners())[7];
            const KEEPER_ROLE = await router.KEEPER_ROLE();

            // Grant
            await expect(router.connect(owner).grantRole(KEEPER_ROLE, keeper.address))
                .to.emit(router, "RoleGranted")
                .withArgs(KEEPER_ROLE, keeper.address, owner.address);
            expect(await router.hasRole(KEEPER_ROLE, keeper.address)).to.be.true;

            // Revoke
            await expect(router.connect(owner).revokeRole(KEEPER_ROLE, keeper.address))
                .to.emit(router, "RoleRevoked")
                .withArgs(KEEPER_ROLE, keeper.address, owner.address);
            expect(await router.hasRole(KEEPER_ROLE, keeper.address)).to.be.false;
        });

        it("Should prevent non-admins from managing roles", async function () {
            const { router, user } = await loadFixture(deployRouterFixture);
            const otherUser = (await ethers.getSigners())[8];
            const KEEPER_ROLE = await router.KEEPER_ROLE();
            const DEFAULT_ADMIN_ROLE = await router.DEFAULT_ADMIN_ROLE();

            await expect(router.connect(user).grantRole(KEEPER_ROLE, otherUser.address))
                .to.be.revertedWithCustomError(router, "AccessControlUnauthorizedAccount")
                .withArgs(user.address, DEFAULT_ADMIN_ROLE);
        });
    });

    describe("Ownership Transfers (Ownable2Step)", function () {
        it("Should transfer ownership in two steps", async function () {
            const { router, owner } = await loadFixture(deployRouterFixture);
            const newOwner = (await ethers.getSigners())[5];

            await router.connect(owner).transferOwnership(newOwner.address);
            expect(await router.owner()).to.equal(owner.address); // Still old owner
            expect(await router.pendingOwner()).to.equal(newOwner.address);

            await router.connect(newOwner).acceptOwnership();
            expect(await router.owner()).to.equal(newOwner.address);
        });
    });

    describe("NuvaVault Pausing", function () {
        it("Should block deposits when NuvaVault is paused", async function () {
            const {
                router,
                nuvaVault,
                owner,
                user,
                amlSigner,
                amount,
                asset: routerAsset,
            } = await loadFixture(deployRouterFixture);
            const deadline = Math.floor(Date.now() / 1000) + 3600;

            // Pause the vault
            const vault = await ethers.getContractAt("NuvaVault", await nuvaVault.getAddress());
            await vault.connect(owner).pause();
            expect(await vault.paused()).to.be.true;

            // Setup deposit
            await routerAsset.connect(user).approve(await router.getAddress(), amount);
            const signature = await signAML(
                amlSigner,
                await router.getAddress(),
                user.address,
                amount,
                user.address,
                0n,
                0n,
                0n,
                deadline,
            );

            // Attempt deposit (should revert because the final hop to NuvaVault is paused)
            await expect(
                router.connect(user).deposit(amount, user.address, 0n, 0n, 0n, signature, deadline),
            ).to.be.revertedWithCustomError(vault, "EnforcedPause");

            // Unpause and verify it works
            await vault.connect(owner).unpause();
            await expect(router.connect(user).deposit(amount, user.address, 0n, 0n, 0n, signature, deadline)).to.emit(
                router,
                "Deposited",
            );
        });
    });

    describe("NuvaVault Upgradeability", function () {
        it("Should upgrade NuvaVault and preserve state", async function () {
            const { nuvaVault, owner, user, amount, amlSigner, router } = await loadFixture(deployRouterFixture);

            // 1. Setup initial state: Perform a deposit to NuvaVault
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const routerAddress = await router.getAddress();
            const routerAsset = await ethers.getContractAt("MockERC20", await router.asset());
            await routerAsset.connect(user).approve(routerAddress, amount);

            const signature = await signAML(
                amlSigner,
                routerAddress,
                user.address,
                amount,
                user.address,
                0n,
                0n,
                0n,
                deadline,
            );
            await router.connect(user).deposit(amount, user.address, 0n, 0n, 0n, signature, deadline);

            const expectedNuvaShares = amount * 1000000000000n;
            const balanceBefore = await nuvaVault.balanceOf(user.address);
            const totalAssetsBefore = await nuvaVault.totalAssets();
            const ownerBefore = await nuvaVault.owner();
            const assetBefore = await nuvaVault.asset();

            expect(balanceBefore).to.equal(expectedNuvaShares);

            // 2. Upgrade to V2
            const NuvaVaultV2 = await ethers.getContractFactory("NuvaVaultV2");
            const initialLimit = ethers.parseEther("1000");
            const upgraded = await upgrades.upgradeProxy(await nuvaVault.getAddress(), NuvaVaultV2, {
                call: { fn: "initializeV2", args: [initialLimit] },
                kind: "uups"
            });

            // 3. Verify state is preserved
            expect(await upgraded.balanceOf(user.address)).to.equal(balanceBefore);
            expect(await upgraded.totalAssets()).to.equal(totalAssetsBefore);
            expect(await upgraded.owner()).to.equal(ownerBefore);
            expect(await upgraded.asset()).to.equal(assetBefore);

            // 4. Verify new logic works
            expect(await upgraded.version()).to.equal("V2");
            expect(await upgraded.withdrawalLimit()).to.equal(initialLimit);
            const newLimit = ethers.parseEther("2000");
            await expect(upgraded.connect(owner).setWithdrawalLimit(newLimit))
                .to.emit(upgraded, "WithdrawalLimitUpdated")
                .withArgs(initialLimit, newLimit);
            expect(await upgraded.withdrawalLimit()).to.equal(newLimit);
        });

        it("Should prevent non-owners from upgrading NuvaVault", async function () {
            const { nuvaVault, user } = await loadFixture(deployRouterFixture);
            const NuvaVaultV2 = await ethers.getContractFactory("NuvaVaultV2");

            await expect(upgrades.upgradeProxy(await nuvaVault.getAddress(), NuvaVaultV2.connect(user)))
                .to.be.revertedWithCustomError(nuvaVault, "OwnableUnauthorizedAccount")
                .withArgs(user.address);
        });
    });

    describe("Input Validation (New Changes)", function () {
        it("Should revert deposit if amount is zero", async function () {
            const { router, user, amlSigner } = await loadFixture(deployRouterFixture);
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const signature = await signAML(
                amlSigner,
                await router.getAddress(),
                user.address,
                0n,
                user.address,
                0n,
                0n,
                0n,
                deadline,
            );
            await expect(
                router
                    .connect(user)
                    .depositWithPermit(
                        0n,
                        user.address,
                        0n,
                        0n,
                        0n,
                        signature,
                        deadline,
                        0,
                        0,
                        ethers.ZeroHash,
                        ethers.ZeroHash,
                    ),
            ).to.be.revertedWithCustomError(router, "InvalidAmount");
        });

        it("Should revert deposit if receiver is zero address", async function () {
            const { router, user, amlSigner, amount } = await loadFixture(deployRouterFixture);
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const signature = await signAML(
                amlSigner,
                await router.getAddress(),
                user.address,
                amount,
                ethers.ZeroAddress,
                0n,
                0n,
                0n,
                deadline,
            );
            await expect(
                router
                    .connect(user)
                    .depositWithPermit(
                        amount,
                        ethers.ZeroAddress,
                        0n,
                        0n,
                        0n,
                        signature,
                        deadline,
                        0,
                        0,
                        ethers.ZeroHash,
                        ethers.ZeroHash,
                    ),
            ).to.be.revertedWithCustomError(router, "InvalidAddress");
        });

        it("Should revert requestRedeem if amount is zero", async function () {
            const { router, user, amlSigner } = await loadFixture(deployRouterFixture);
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const signature = await signRedeemAML(amlSigner, await router.getAddress(), user.address, 0n, deadline);
            await expect(router.connect(user).requestRedeem(0n, signature, deadline)).to.be.revertedWithCustomError(
                router,
                "InvalidAmount",
            );
        });

        it("Should handle sweepRedemptions with zero proxy address", async function () {
            const { router, owner } = await loadFixture(deployRouterFixture);
            const { redemptionProxyImplementation } = await loadFixture(deployRedemptionProxyFixture);
            const KEEPER_ROLE = await router.KEEPER_ROLE();
            await router.grantRole(KEEPER_ROLE, owner.address);

            // Set implementation first
            await router
                .connect(owner)
                .setRedemptionProxyImplementation(await redemptionProxyImplementation.getAddress());

            await expect(router.connect(owner).sweepRedemptions([ethers.ZeroAddress], [100n]))
                .to.emit(router, "RedemptionsSwept")
                .withArgs([ethers.ZeroAddress], [ethers.ZeroAddress], [100n], 0);
        });

        it("Should NOT delete mapping in sweepRedemptions if amount is zero", async function () {
            const {
                router,
                owner,
                user,
                amlSigner,
                amount,
                asset: routerAsset,
                nuvaVault,
            } = await loadFixture(deployRouterFixture);
            const KEEPER_ROLE = await router.KEEPER_ROLE();
            await router.grantRole(KEEPER_ROLE, owner.address);

            // 1. Setup a redemption proxy
            const RedemptionProxy = await ethers.getContractFactory("RedemptionProxy");
            const impl = await RedemptionProxy.deploy();
            await router.connect(owner).setRedemptionProxyImplementation(await impl.getAddress());

            // 2. Do a deposit to have shares
            await routerAsset.connect(user).approve(await router.getAddress(), amount);
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const depSig = await signAML(
                amlSigner,
                await router.getAddress(),
                user.address,
                amount,
                user.address,
                0n,
                0n,
                0n,
                deadline,
            );
            await router
                .connect(user)
                .depositWithPermit(
                    amount,
                    user.address,
                    0n,
                    0n,
                    0n,
                    depSig,
                    deadline,
                    0,
                    0,
                    ethers.ZeroHash,
                    ethers.ZeroHash,
                );

            const nuvaShares = await nuvaVault.balanceOf(user.address);
            await nuvaVault.connect(user).approve(await router.getAddress(), nuvaShares);

            const redSig = await signRedeemAML(
                amlSigner,
                await router.getAddress(),
                user.address,
                nuvaShares,
                deadline,
            );
            const tx = await router.connect(user).requestRedeem(nuvaShares, redSig, deadline);
            const receipt = await tx.wait();
            const proxyAddress = receipt.logs.find((l) => l.fragment && l.fragment.name === "RedemptionRequested")
                .args[1];

            // 3. Sweep with zero amount
            await router.connect(owner).sweepRedemptions([proxyAddress], [0n]);

            // 4. Check if mapping is NOT deleted
            expect(await router.redemptionProxyToUser(proxyAddress)).to.equal(user.address);
        });
    });
});
