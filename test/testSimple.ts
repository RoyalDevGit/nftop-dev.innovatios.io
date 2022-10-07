import '@nomiclabs/hardhat-waffle';

import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';
import { assert, expect } from 'chai';
import { ethers, network, waffle } from 'hardhat';

import {
  MockERC20,
  NFT721,
  NFT1155,
  NFTMarketSimple
} from '../typechain/pulse';

const dummyDeadline = 9000000000;

describe('Market contract with simple market buy, without royalties', async () => {
  let market: NFTMarketSimple, nft721: NFT721, nft1155: NFT1155;
  let user1: SignerWithAddress,
    user2: SignerWithAddress,
    deployer: SignerWithAddress,
    userWith721NFT: SignerWithAddress,
    userWith1155NFT: SignerWithAddress;

  beforeEach(async function () {
    const accounts = await ethers.getSigners();
    user1 = accounts[0];
    user2 = accounts[1];
    deployer = accounts[2];
    userWith721NFT = accounts[3];
    userWith1155NFT = accounts[4];

    const Market = await ethers.getContractFactory('NFTMarketSimple');
    const NFT1155 = await ethers.getContractFactory('NFT1155');
    const NFT721 = await ethers.getContractFactory('NFT721');

    market = (await Market.connect(deployer).deploy()) as NFTMarketSimple;

    nft721 = (await NFT721.connect(deployer).deploy()) as NFT721;
    await nft721.connect(userWith721NFT).createToken('dummy', 0);
    await nft721
      .connect(userWith721NFT)
      .setApprovalForAll(market.address, true);

    nft1155 = (await NFT1155.connect(user1).deploy()) as NFT1155;
    await nft1155.connect(userWith1155NFT).createToken('dummy', 5, 0);
    await nft1155
      .connect(userWith1155NFT)
      .setApprovalForAll(market.address, true);
  });

  describe('721 listing creation', async () => {
    it('should create a correct 721 marketitem', async () => {
      await market
        .connect(userWith721NFT)
        .createSimpleMarketItem(nft721.address, 1, 100, 1, dummyDeadline);

      const listingId = await market.getLatestListItemId();
      const res = await market.simpleListingIdToMarketItem(listingId);
      const listedAmount = await market.userListedTokens(
        userWith721NFT.address,
        nft721.address,
        1
      );

      expect(res.nftContract).to.equal(nft721.address);
      expect(res.nftTokenId).to.equal(1);
      expect(res.price).to.equal(100);
      expect(res.originalQuantity).to.equal(1);
      expect(res.remainingQuantity).to.equal(1);
      expect(res.ownerAddress).to.equal(userWith721NFT.address);
      expect(listedAmount).to.equal(1);
    });

    it('buyer can relist', async () => {
      await market
        .connect(userWith721NFT)
        .createSimpleMarketItem(nft721.address, 1, 100, 1, dummyDeadline);

      await market.connect(user1).buySimple(1, 1, { value: 101 });

      await nft721.connect(user1).setApprovalForAll(market.address, true);

      await market
        .connect(user1)
        .createSimpleMarketItem(nft721.address, 1, 200, 1, dummyDeadline);

      const listingId = await market.getLatestListItemId();
      expect(listingId).to.equal(2);
    });

    it('should emit the correct events', async () => {
      await expect(
        market
          .connect(userWith721NFT)
          .createSimpleMarketItem(nft721.address, 1, 100, 1, dummyDeadline)
      )
        .to.emit(market, 'SimpleItemCreated')
        .withArgs(1);
    });

    it('should fail if paused', async () => {
      await market.connect(deployer).pause();
      await expect(
        market
          .connect(userWith721NFT)
          .createSimpleMarketItem(nft721.address, 1, 100, 1, dummyDeadline)
      ).to.be.revertedWith('Pausable: paused');
    });

    it('should fail if too low wrong price', async () => {
      await expect(
        market
          .connect(userWith721NFT)
          .createSimpleMarketItem(nft721.address, 1, 0, 1, dummyDeadline)
      ).to.be.revertedWith('Price too low');
    });

    it('should fail if deadline not in the future', async () => {
      await expect(
        market
          .connect(userWith721NFT)
          .createSimpleMarketItem(nft721.address, 1, 1, 1, 1)
      ).to.be.revertedWith('Deadline must be in the future');
    });

    it('should fail if trying to list multiple', async () => {
      await expect(
        market
          .connect(userWith721NFT)
          .createSimpleMarketItem(nft721.address, 1, 1, 5, dummyDeadline)
      ).to.be.revertedWith('ERC721 token can only have one');
    });

    it('should fail if already listed', async () => {
      await market
        .connect(userWith721NFT)
        .createSimpleMarketItem(nft721.address, 1, 1, 1, dummyDeadline);
      await expect(
        market
          .connect(userWith721NFT)
          .createSimpleMarketItem(nft721.address, 1, 1, 1, dummyDeadline)
      ).to.be.revertedWith('A listing already exists for the token');
    });

    it('should fail if no allowance', async () => {
      await nft721
        .connect(userWith721NFT)
        .setApprovalForAll(market.address, false);
      await expect(
        market
          .connect(userWith721NFT)
          .createSimpleMarketItem(nft721.address, 1, 1, 1, dummyDeadline)
      ).to.be.revertedWith('Not allowed to manage tokens');
    });

    it("should fail if trying to list NFT you don't own", async () => {
      await expect(
        market
          .connect(user1)
          .createSimpleMarketItem(nft721.address, 1, 1, 1, dummyDeadline)
      ).to.be.revertedWith('Not enough NFTs');
    });
  });

  describe('721 listing purchase', async () => {
    beforeEach(async function () {
      const timestamp = await getTimestamp();
      await market
        .connect(userWith721NFT)
        .createSimpleMarketItem(nft721.address, 1, 100, 1, timestamp + 5000);
    });

    it('should buy', async () => {
      const listingId = await market.getLatestListItemId();

      await market.connect(user2).buySimple(listingId, 1, { value: 101 });

      const res = await market.simpleListingIdToMarketItem(listingId);

      expect(res.originalQuantity).to.equal(1);
      expect(res.remainingQuantity).to.equal(0);
    });

    it('should transfer value from buyer to seller', async () => {
      const listingId = await market.getLatestListItemId();

      const buy = market.connect(user2).buySimple(listingId, 1, {
        value: 101,
        gasPrice: 0
      });

      await expect(() => buy).to.changeEtherBalances(
        [user2, userWith721NFT],
        [-101, 100]
      );
    });

    it('should transfer NFT to buyer', async () => {
      const ownerBefore = await nft721.ownerOf(1);

      const listingId = await market.getLatestListItemId();

      await market.connect(user1).buySimple(listingId, 1, {
        value: 101
      });

      const ownerAfter = await nft721.ownerOf(1);

      expect(ownerBefore).to.equal(userWith721NFT.address);
      expect(ownerAfter).to.equal(user1.address);
    });

    it('should forward commission', async () => {
      const listingId = await market.getLatestListItemId();

      const buy = market.connect(user2).buySimple(listingId, 1, {
        value: 101,
        gasPrice: 0
      });

      await expect(() => buy).to.changeEtherBalance(deployer, 1);
    });

    it('should emit the correct events', async () => {
      const listingId = await market.getLatestListItemId();

      await expect(
        market.connect(user2).buySimple(listingId, 1, { value: 101 })
      )
        .to.emit(market, 'SimpleItemSold')
        .withArgs(1, 1, user2.address);
    });

    it('should fail if paused', async () => {
      const listingId = await market.getLatestListItemId();

      await market.connect(deployer).pause();
      await expect(
        market.connect(user2).buySimple(listingId, 1, { value: 101 })
      ).to.be.revertedWith('Pausable: paused');
    });

    it("should fail if listing doesn't exist", async () => {
      const listingId = await market.getLatestListItemId();

      await expect(
        market.connect(user2).buySimple(listingId.add(1), 1, { value: 101 })
      ).to.be.revertedWith("Listing doesn't exist");
    });

    it('fails with zero quantity', async () => {
      const listingId = await market.getLatestListItemId();

      await expect(
        market.buySimple(listingId, 0, { value: 404 })
      ).to.be.revertedWith('Have to buy something');

      await expect(
        market.buySimple(listingId, 5, { value: 404 })
      ).to.be.revertedWith('Not enough items for sale');
    });

    it("fails if it's your own item", async () => {
      const listingId = await market.getLatestListItemId();

      await expect(
        market.connect(userWith721NFT).buySimple(listingId, 1, { value: 101 })
      ).to.be.revertedWith("Can't buy your own");
    });

    it('fails with wrong value', async () => {
      const listingId = await market.getLatestListItemId();

      await expect(
        market.connect(user2).buySimple(listingId, 1, { value: 100 })
      ).to.be.revertedWith('Incorrect value provided');

      await expect(
        market.buySimple(listingId, 1, { value: 102 })
      ).to.be.revertedWith('Incorrect value provided');
    });

    it('fails with for expired sale', async () => {
      const listingId = await market.getLatestListItemId();

      await nextDay();

      await expect(
        market.connect(user2).buySimple(listingId, 1, { value: 101 })
      ).to.be.revertedWith('The sale has ended');
    });

    it('fails if the seller no longer has the NFT', async () => {
      const listingId = await market.getLatestListItemId();

      await nft721
        .connect(userWith721NFT)
        .transferFrom(userWith721NFT.address, user2.address, 1);
      await expect(
        market.connect(user2).buySimple(listingId, 1, { value: 101 })
      ).to.be.revertedWith("Seller doesn't have the NFT");
    });
  });

  describe('721 canceling', async () => {
    beforeEach(async function () {
      const timestamp = await getTimestamp();
      await market
        .connect(userWith721NFT)
        .createSimpleMarketItem(nft721.address, 1, 100, 1, timestamp + 5000);
    });

    it('should be able to cancel', async () => {
      const listingId = await market.getLatestListItemId();

      await market.connect(userWith721NFT).cancelSimpleListing(listingId);

      const listedAmount = await market.userListedTokens(
        userWith721NFT.address,
        nft721.address,
        1
      );
      const res2 = await market.simpleListingIdToMarketItem(listingId);

      expect(listedAmount).to.equal(0);
      expect(res2.remainingQuantity).to.equal(0);
    });

    it('should emit the correct events', async () => {
      const listingId = await market.getLatestListItemId();

      await expect(
        market.connect(userWith721NFT).cancelSimpleListing(listingId)
      )
        .to.emit(market, 'SimpleItemCancelled')
        .withArgs(1);
    });

    it('buying is not possible after cancel', async () => {
      const listingId = await market.getLatestListItemId();

      await market.connect(userWith721NFT).cancelSimpleListing(listingId);

      await expect(
        market.connect(user2).buySimple(listingId, 1, { value: 101 })
      ).to.revertedWith('Not enough items for sale');
    });

    it('should fail if paused', async () => {
      const listingId = await market.getLatestListItemId();

      await market.connect(deployer).pause();
      await expect(
        market.connect(userWith721NFT).cancelSimpleListing(listingId)
      ).to.be.revertedWith('Pausable: paused');
    });

    it('fails for non-existing listing', async () => {
      const listingId = await market.getLatestListItemId();

      await expect(
        market.connect(user2).cancelSimpleListing(listingId.add(5))
      ).to.revertedWith("Listing doesn't exist");
    });

    it('fails if not your listing', async () => {
      const listingId = await market.getLatestListItemId();

      await expect(
        market.connect(user2).cancelSimpleListing(listingId)
      ).to.revertedWith('Only owner can cancel');
    });

    it('fails if trying to cancel twice', async () => {
      const listingId = await market.getLatestListItemId();

      await market.connect(userWith721NFT).cancelSimpleListing(listingId);

      await expect(
        market.connect(userWith721NFT).cancelSimpleListing(listingId)
      ).to.revertedWith('There is nothing to cancel');
    });
  });

  describe('1155-specific listing creation', async () => {
    // Only tests which test functionality which differs from 721

    it('should create a correct 1155 marketitem', async () => {
      await market
        .connect(userWith1155NFT)
        .createSimpleMarketItem(nft1155.address, 1, 100, 4, dummyDeadline);

      const listingId = await market.getLatestListItemId();
      const res = await market.simpleListingIdToMarketItem(listingId);
      const listedAmount = await market.userListedTokens(
        userWith1155NFT.address,
        nft1155.address,
        1
      );

      expect(res.nftContract).to.equal(nft1155.address);
      expect(res.nftTokenId).to.equal(1);
      expect(res.price).to.equal(100);
      expect(res.originalQuantity).to.equal(4);
      expect(res.remainingQuantity).to.equal(4);
      expect(res.ownerAddress).to.equal(userWith1155NFT.address);
      expect(listedAmount).to.equal(4);
    });

    it('should fail if no allowance', async () => {
      await nft1155
        .connect(userWith1155NFT)
        .setApprovalForAll(market.address, false);
      await expect(
        market
          .connect(userWith1155NFT)
          .createSimpleMarketItem(nft1155.address, 1, 1, 1, dummyDeadline)
      ).to.be.revertedWith('Not allowed to manage tokens');
    });
  });

  describe('1155-specific listing purchase', async () => {
    // Only tests which test functionality which differs from 721

    beforeEach(async function () {
      const timestamp = await getTimestamp();
      await market
        .connect(userWith1155NFT)
        .createSimpleMarketItem(nft1155.address, 1, 100, 4, timestamp + 5000);
    });

    it('should buy', async () => {
      const listingId = await market.getLatestListItemId();

      await market.connect(user2).buySimple(listingId, 2, { value: 202 });

      const res = await market.simpleListingIdToMarketItem(listingId);

      expect(res.originalQuantity).to.equal(4);
      expect(res.remainingQuantity).to.equal(2);
    });

    it('should transfer value from buyer to seller', async () => {
      const listingId = await market.getLatestListItemId();

      const buy = market.connect(user2).buySimple(listingId, 2, {
        value: 202,
        gasPrice: 0
      });

      await expect(() => buy).to.changeEtherBalances(
        [user2, userWith1155NFT],
        [-202, 200]
      );
    });

    it('should transfer NFTs to buyer', async () => {
      const sellerBalanceBefore = await nft1155.balanceOf(
        userWith1155NFT.address,
        1
      );
      const buyerBalanceBefore = await nft1155.balanceOf(user1.address, 1);

      const listingId = await market.getLatestListItemId();

      await market.connect(user1).buySimple(listingId, 3, {
        value: 303
      });

      const sellerBalanceAfter = await nft1155.balanceOf(
        userWith1155NFT.address,
        1
      );
      const buyerBalanceAfter = await nft1155.balanceOf(user1.address, 1);

      expect(buyerBalanceAfter.sub(buyerBalanceBefore).toNumber()).to.equal(3);
      expect(sellerBalanceAfter.sub(sellerBalanceBefore).toNumber()).to.equal(
        -3
      );
    });

    it('should forward commission', async () => {
      const listingId = await market.getLatestListItemId();

      const buy = market.connect(user2).buySimple(listingId, 2, {
        value: 202,
        gasPrice: 0
      });

      await expect(() => buy).to.changeEtherBalance(deployer, 2);
    });

    it('should allow multiple buys', async () => {
      const listingId = await market.getLatestListItemId();

      await market.connect(user1).buySimple(listingId, 2, { value: 202 });
      await market.connect(user2).buySimple(listingId, 1, { value: 101 });
      await market
        .connect(userWith721NFT)
        .buySimple(listingId, 1, { value: 101 });

      const res = await market.simpleListingIdToMarketItem(listingId);

      const user1Balance = await nft1155.balanceOf(user1.address, 1);
      const user2Balance = await nft1155.balanceOf(user2.address, 1);
      const user3Balance = await nft1155.balanceOf(userWith721NFT.address, 1);

      expect(res.originalQuantity).to.equal(4);
      expect(res.remainingQuantity).to.equal(0);

      expect(user1Balance).to.equal(2);
      expect(user2Balance).to.equal(1);
      expect(user3Balance).to.equal(1);
    });

    it('fails if all have been bought already', async () => {
      const listingId = await market.getLatestListItemId();

      await market.connect(user1).buySimple(listingId, 4, { value: 404 });

      await expect(
        market.connect(user2).buySimple(listingId, 1, { value: 101 })
      ).to.be.revertedWith('Not enough items for sale');
    });
  });

  describe('1155-specific canceling', async () => {
    // Only tests which test functionality which differs from 721

    beforeEach(async function () {
      await market
        .connect(userWith1155NFT)
        .createSimpleMarketItem(nft1155.address, 1, 100, 4, dummyDeadline);
    });

    it('should be able to cancel', async () => {
      const listingId = await market.getLatestListItemId();

      await market.connect(userWith1155NFT).cancelSimpleListing(listingId);

      const listedAmount = await market.userListedTokens(
        userWith1155NFT.address,
        nft1155.address,
        1
      );
      const res2 = await market.simpleListingIdToMarketItem(listingId);

      expect(listedAmount).to.equal(0);
      expect(res2.remainingQuantity).to.equal(0);
    });

    it('buying is not possible after cancel', async () => {
      const listingId = await market.getLatestListItemId();

      await market.connect(userWith1155NFT).cancelSimpleListing(listingId);

      await expect(
        market.connect(user2).buySimple(listingId, 1, { value: 101 })
      ).to.revertedWith('Not enough items for sale');
    });
  });
});

describe('Market contract with simple market buy, with royalties', async () => {
  let market: NFTMarketSimple,
    nft721: NFT721,
    nft1155: NFT1155,
    erc20: MockERC20;
  let user1: SignerWithAddress,
    user2: SignerWithAddress,
    deployer: SignerWithAddress,
    user721Creator: SignerWithAddress,
    user1155Creator: SignerWithAddress,
    userWith721NFT: SignerWithAddress,
    userWith1155NFT: SignerWithAddress,
    userWith20Token: SignerWithAddress;

  beforeEach(async function () {
    const accounts = await ethers.getSigners();
    user1 = accounts[0];
    user2 = accounts[1];
    deployer = accounts[2];
    user721Creator = accounts[3];
    user1155Creator = accounts[4];
    userWith721NFT = accounts[5];
    userWith1155NFT = accounts[6];
    userWith20Token = accounts[7];

    const Market = await ethers.getContractFactory('NFTMarketSimple');
    const NFT1155 = await ethers.getContractFactory('NFT1155');
    const NFT721 = await ethers.getContractFactory('NFT721');
    const Erc20 = await ethers.getContractFactory('MockERC20');

    erc20 = (await Erc20.connect(userWith20Token).deploy()) as MockERC20;
    market = (await Market.connect(deployer).deploy()) as NFTMarketSimple;
    nft721 = (await NFT721.connect(deployer).deploy()) as NFT721;

    await nft721.connect(user721Creator).createToken('dummy', 300);
    await nft721
      .connect(user721Creator)
      .transferFrom(user721Creator.address, userWith721NFT.address, 1);
    await nft721
      .connect(userWith721NFT)
      .setApprovalForAll(market.address, true);

    nft1155 = (await NFT1155.connect(user721Creator).deploy()) as NFT1155;
    await nft1155.connect(user1155Creator).createToken('dummy', 5, 300);
    await nft1155
      .connect(user1155Creator)
      .safeTransferFrom(
        user1155Creator.address,
        userWith1155NFT.address,
        1,
        3,
        []
      );

    await nft1155
      .connect(userWith1155NFT)
      .setApprovalForAll(market.address, true);

    await erc20.connect(userWith20Token).freeMint(10);
    await erc20.connect(userWith20Token).approve(market.address, 10);
  });

  describe('purchase for 721 and 1155', async () => {
    it('first sale gives royalty correctly', async () => {
      await market
        .connect(userWith721NFT)
        .createSimpleMarketItem(nft721.address, 1, 100, 1, dummyDeadline);

      const listingId = await market.getLatestListItemId();

      const buy = market
        .connect(user1)
        .buySimple(listingId, 1, { value: 101, gasPrice: 0 });

      await expect(() => buy).to.changeEtherBalances(
        [user721Creator, userWith721NFT, user1],
        [3, 97, -101]
      );
    });

    it('second sale gives royalty correctly', async () => {
      await market
        .connect(userWith721NFT)
        .createSimpleMarketItem(nft721.address, 1, 100, 1, dummyDeadline);

      let listingId = await market.getLatestListItemId();

      await market
        .connect(user1)
        .buySimple(listingId, 1, { value: 101, gasPrice: 0 });

      await nft721.connect(user1).setApprovalForAll(market.address, true);
      await market
        .connect(user1)
        .createSimpleMarketItem(nft721.address, 1, 200, 1, dummyDeadline);

      listingId = await market.getLatestListItemId();

      const buy2 = market
        .connect(user2)
        .buySimple(listingId, 1, { value: 202, gasPrice: 0 });

      await expect(() => buy2).to.changeEtherBalances(
        [user721Creator, userWith721NFT, user1, user2],
        [6, 0, 200 - 6, -202]
      );
    });

    it('first sale gives royalty correctly when selling multiple', async () => {
      await market
        .connect(userWith1155NFT)
        .createSimpleMarketItem(nft1155.address, 1, 100, 3, dummyDeadline);

      const listingId = await market.getLatestListItemId();

      const buy = market
        .connect(user1)
        .buySimple(listingId, 2, { value: 202, gasPrice: 0 });

      await expect(() => buy).to.changeEtherBalances(
        [user1155Creator, userWith1155NFT, user1, market, deployer],
        [6, 200 - 6, -202, 0, 2]
      );
    });

    it('second sale gives royalty correctly when selling multiple', async () => {
      await market
        .connect(userWith1155NFT)
        .createSimpleMarketItem(nft1155.address, 1, 100, 3, dummyDeadline);

      let listingId = await market.getLatestListItemId();

      await market
        .connect(user1)
        .buySimple(listingId, 2, { value: 202, gasPrice: 0 });

      await nft1155.connect(user1).setApprovalForAll(market.address, true);

      await market
        .connect(user1)
        .createSimpleMarketItem(nft1155.address, 1, 300, 2, dummyDeadline);
      listingId = await market.getLatestListItemId();

      const buy = market
        .connect(user2)
        .buySimple(listingId, 1, { value: 303, gasPrice: 0 });

      await expect(() => buy).to.changeEtherBalances(
        [user1155Creator, user2, user1, market, deployer],
        [9, -303, 300 - 9, 0, 3]
      );
    });

    it('no dust left under any circumstances', async () => {
      await market
        .connect(userWith721NFT)
        .createSimpleMarketItem(nft721.address, 1, 731, 1, dummyDeadline);
      const listingId = await market.getLatestListItemId();

      // 1% = 7
      // 3% = 21

      const buy = market
        .connect(user1)
        .buySimple(listingId, 1, { value: 731 + 7, gasPrice: 0 });

      await expect(() => buy).to.changeEtherBalances(
        [user721Creator, userWith721NFT, user1, market, deployer],
        [21, 731 - 21, -(731 + 7), 0, 7]
      );
    });
  });
});

const getTimestamp = async () => {
  const block = await ethers.provider.getBlock('latest');
  return block.timestamp;
};

const nextDay = async () => {
  const oneDay = 24 * 60 * 60;
  await network.provider.send('evm_increaseTime', [oneDay]);
  await network.provider.send('evm_mine');
};
