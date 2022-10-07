import '@nomiclabs/hardhat-waffle';
import '@nomiclabs/hardhat-waffle';

import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { ethers, network } from 'hardhat';

import {
  MockERC20,
  NFT721,
  NFT1155,
  NFTMarketAuction
} from '../typechain/pulse';

const dummyDeadline = 9000000000;
const erc20AllowanceAmount = 1000;
const erc20MintAmount = 10000;

describe('Market contract with auction market buy, without royalties', async () => {
  let market: NFTMarketAuction,
    nft721: NFT721,
    nft1155: NFT1155,
    erc20: MockERC20;
  let user1: SignerWithAddress,
    user2: SignerWithAddress,
    deployer: SignerWithAddress,
    userWith721NFT: SignerWithAddress,
    userWith1155NFT: SignerWithAddress,
    userWith20Token: SignerWithAddress;

  beforeEach(async function () {
    const accounts = await ethers.getSigners();
    user1 = accounts[0];
    user2 = accounts[1];
    deployer = accounts[2];
    userWith721NFT = accounts[3];
    userWith1155NFT = accounts[4];
    userWith20Token = accounts[5];

    const Market = await ethers.getContractFactory('NFTMarketAuction');
    const NFT1155 = await ethers.getContractFactory('NFT1155');
    const NFT721 = await ethers.getContractFactory('NFT721');
    const Erc20 = await ethers.getContractFactory('MockERC20');

    erc20 = (await Erc20.connect(userWith20Token).deploy()) as MockERC20;
    market = (await Market.connect(deployer).deploy([
      erc20.address
    ])) as NFTMarketAuction;

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

    await erc20.connect(userWith20Token).freeMint(erc20MintAmount);
    await erc20
      .connect(userWith20Token)
      .approve(market.address, erc20AllowanceAmount);
  });

  xdescribe('721 auction creation', async () => {
    it('should create a correct 721 auction marketitem', async () => {
      await market
        .connect(userWith721NFT)
        .createAuctionMarketItem(
          nft721.address,
          1,
          erc20.address,
          100,
          dummyDeadline
        );
      const listingId = await market.getLatestListItemId();
      const res = await market.auctionListingIdToMarketItem(listingId);
      const bids = await market.getAuctionBids(listingId);
      const listedAmount = await market.userListedTokens(
        userWith721NFT.address,
        nft721.address,
        1
      );

      expect(res.nftContract).to.equal(nft721.address);
      expect(res.nftTokenId).to.equal(1);
      expect(res.priceTokenAddress).to.equal(erc20.address);
      expect(res.startPrice).to.equal(100);
      expect(res.ownerAddress).to.equal(userWith721NFT.address);
      expect(res.deadline).to.equal(dummyDeadline);
      expect(res.isClosed).to.false;

      expect(bids.length).to.equal(0);

      expect(listedAmount).to.equal(1);
    });

    it('should succeed with zero starting price', async () => {
      await market
        .connect(userWith721NFT)
        .createAuctionMarketItem(
          nft721.address,
          1,
          erc20.address,
          0,
          dummyDeadline
        );
    });

    it('should emit the correct events', async () => {
      await expect(
        market
          .connect(userWith721NFT)
          .createAuctionMarketItem(
            nft721.address,
            1,
            erc20.address,
            100,
            dummyDeadline
          )
      )
        .to.emit(market, 'AuctionItemCreated')
        .withArgs(1);
    });

    it('should fail if paused', async () => {
      await market.connect(deployer).pause();
      await expect(
        market
          .connect(deployer)
          .createAuctionMarketItem(
            nft721.address,
            1,
            erc20.address,
            100,
            dummyDeadline
          )
      ).to.be.revertedWith('Pausable: paused');
    });

    it('should fail if deadline not in the future', async () => {
      await expect(
        market
          .connect(userWith721NFT)
          .createAuctionMarketItem(nft721.address, 1, erc20.address, 100, 0)
      ).to.be.revertedWith('Deadline must be in the future');
    });

    it('should fail if already listed', async () => {
      await market
        .connect(userWith721NFT)
        .createAuctionMarketItem(
          nft721.address,
          1,
          erc20.address,
          100,
          dummyDeadline
        );
      await expect(
        market
          .connect(userWith721NFT)
          .createAuctionMarketItem(
            nft721.address,
            1,
            erc20.address,
            100,
            dummyDeadline
          )
      ).to.be.revertedWith('A listing already exists for the token');
    });

    it('should fail if no allowance', async () => {
      await nft721
        .connect(userWith721NFT)
        .setApprovalForAll(market.address, false);
      await expect(
        market
          .connect(userWith721NFT)
          .createAuctionMarketItem(
            nft721.address,
            1,
            erc20.address,
            100,
            dummyDeadline
          )
      ).to.be.revertedWith('Not allowed to manage tokens');
    });

    it("should fail if trying to list NFT you don't own", async () => {
      await expect(
        market
          .connect(user1)
          .createAuctionMarketItem(
            nft721.address,
            1,
            erc20.address,
            100,
            dummyDeadline
          )
      ).to.be.revertedWith('Not enough NFTs');
    });

    it('should fail if trying to use non-whitelisted token', async () => {
      await expect(
        market.connect(userWith721NFT).createAuctionMarketItem(
          nft721.address,
          1,
          nft1155.address, // should be an ERC20, but doesn't matter here
          100,
          dummyDeadline
        )
      ).to.be.revertedWith('Invalid price token');
    });
  });

  xdescribe('721 auction bidding', async () => {
    beforeEach(async function () {
      const timestamp = await getTimestamp();
      await market
        .connect(userWith721NFT)
        .createAuctionMarketItem(
          nft721.address,
          1,
          erc20.address,
          2,
          timestamp + 5000
        );
    });

    it('should be able to place a bid', async () => {
      const listingId = await market.getLatestListItemId();

      await market.connect(userWith20Token).bid(listingId, 10);

      const bids = await market.getAuctionBids(listingId);

      expect(bids.length).to.equal(1);
      expect(bids[0].bidAmount).to.equal(10);
      expect(bids[0].bidder).to.equal(userWith20Token.address);
    });

    it('should be able to place a lower bid than earlier', async () => {
      const listingId = await market.getLatestListItemId();

      await market.connect(userWith20Token).bid(listingId, 10);
      await market.connect(userWith20Token).bid(listingId, 5);

      const bids = await market.getAuctionBids(listingId);

      expect(bids.length).to.equal(2);
      expect(bids[0].bidAmount).to.equal(10);
      expect(bids[0].bidder).to.equal(userWith20Token.address);
      expect(bids[1].bidAmount).to.equal(5);
      expect(bids[1].bidder).to.equal(userWith20Token.address);
    });

    it('multiple users can bid', async () => {
      await erc20.connect(userWith20Token).transfer(user1.address, 50);
      await erc20.connect(user1).approve(market.address, 50);

      const listingId = await market.getLatestListItemId();

      await market.connect(userWith20Token).bid(listingId, 10);
      await market.connect(user1).bid(listingId, 15);
      await market.connect(userWith20Token).bid(listingId, 7);

      const bids = await market.getAuctionBids(listingId);

      expect(bids[0].bidAmount).to.equal(10);
      expect(bids[0].bidder).to.equal(userWith20Token.address);
      expect(bids[1].bidAmount).to.equal(15);
      expect(bids[1].bidder).to.equal(user1.address);
      expect(bids[2].bidAmount).to.equal(7);
      expect(bids[2].bidder).to.equal(userWith20Token.address);
    });

    it('should emit the correct events', async () => {
      const listingId = await market.getLatestListItemId();

      await expect(market.connect(userWith20Token).bid(listingId, 10))
        .to.emit(market, 'AuctionBidCreated')
        .withArgs(1, 0, 10);
    });

    it('should fail if paused', async () => {
      const listingId = await market.getLatestListItemId();
      await market.connect(deployer).pause();
      await expect(
        market.connect(userWith20Token).bid(listingId, 10)
      ).to.be.revertedWith('Pausable: paused');
    });

    it("should fail if listing doesn't exist", async () => {
      const listingId = await market.getLatestListItemId();

      await expect(
        market.connect(userWith20Token).bid(listingId.add(5), 5)
      ).to.revertedWith("Listing doesn't exist");
    });

    it('should fail if trying to bid on your own auction', async () => {
      await erc20.connect(userWith20Token).transfer(userWith721NFT.address, 10);
      const listingId = await market.getLatestListItemId();
      await expect(
        market.connect(userWith721NFT).bid(listingId, 10)
      ).to.be.revertedWith("Auction owner can't place bid on his Auction");
    });

    it('should fail if too low bid', async () => {
      await nextDay();
      const listingId = await market.getLatestListItemId();
      await expect(
        market.connect(userWith20Token).bid(listingId, 1)
      ).to.be.revertedWith('Too low price');
    });

    it('should fail if deadline has passed', async () => {
      await nextDay();
      const listingId = await market.getLatestListItemId();
      await expect(
        market.connect(userWith20Token).bid(listingId, 10)
      ).to.be.revertedWith('The auction has ended');
    });

    it('should fail if auction has been closed due to termination', async () => {
      await nextDay();
      const listingId = await market.getLatestListItemId();
      await market.terminateAuction(listingId);

      await expect(
        market.connect(userWith20Token).bid(listingId, 10)
      ).to.be.revertedWith('Listing is closed');
    });

    it('should fail if auction has been closed due to acceptance', async () => {
      const listingId = await market.getLatestListItemId();
      await market.connect(userWith20Token).bid(listingId, 20);
      await market.connect(userWith721NFT).acceptBid(listingId, 0);

      await expect(
        market.connect(userWith20Token).bid(listingId, 10)
      ).to.be.revertedWith('Listing is closed');
    });

    it('should fail if auction has been closed due to cancellation', async () => {
      const listingId = await market.getLatestListItemId();
      await market.connect(userWith721NFT).cancelAuctionListing(listingId);

      await expect(
        market.connect(userWith20Token).bid(listingId, 10)
      ).to.be.revertedWith('Listing is closed');
    });

    it('should fail if not enough allowance', async () => {
      const listingId = await market.getLatestListItemId();
      await expect(
        market.connect(userWith20Token).bid(listingId, erc20AllowanceAmount + 1)
      ).to.be.revertedWith('Not enough allowance');
    });

    it('should fail if not enough tokens', async () => {
      await erc20
        .connect(userWith20Token)
        .approve(market.address, erc20MintAmount + 1);

      const listingId = await market.getLatestListItemId();
      await expect(
        market.connect(userWith20Token).bid(listingId, erc20MintAmount + 1)
      ).to.be.revertedWith('Not enough tokens');
    });

    it('should fail after cancellation', async () => {
      const listingId = await market.getLatestListItemId();

      await market.connect(userWith721NFT).cancelAuctionListing(listingId);

      await erc20.connect(userWith20Token).transfer(user1.address, 10);
      await erc20.connect(user1).approve(market.address, 10);
      await expect(market.connect(user1).bid(listingId, 5)).to.revertedWith(
        'Listing is closed'
      );
    });
  });

  describe('721 auction extension', async () => {
    let timestamp: number;
    const deadlineAfterNow = 100;
    beforeEach(async function () {
      timestamp = await getTimestamp();
      await market
        .connect(userWith721NFT)
        .createAuctionMarketItem(
          nft721.address,
          1,
          erc20.address,
          2,
          timestamp + deadlineAfterNow
        );
    });

    it('new bid should extend', async () => {
      const listingId = await market.getLatestListItemId();

      const oldDeadline = (await market.auctionListingIdToMarketItem(listingId))
        .deadline;
      await market.connect(userWith20Token).bid(listingId, 10);
      const newDeadline = (await market.auctionListingIdToMarketItem(listingId))
        .deadline;

      // Check the time - testing time differences has to be an approximation
      await expect(
        oldDeadline.add(600 - deadlineAfterNow).toNumber()
      ).to.approximately(newDeadline.toNumber(), 5);
    });

    it('should be able to bid after old deadline and before new deadline', async () => {
      const listingId = await market.getLatestListItemId();

      // Bid on time
      await market.connect(userWith20Token).bid(listingId, 10);

      await increaseTime(deadlineAfterNow + 50);

      // Bid after old deadline
      await market.connect(userWith20Token).bid(listingId, 15);

      const bids = await market.getAuctionBids(listingId);
      expect(bids.length).to.be.equal(2);
    });

    it('should fail to bid after new deadline', async () => {
      const listingId = await market.getLatestListItemId();

      // Bid on time
      await market.connect(userWith20Token).bid(listingId, 10);

      await increaseTime(deadlineAfterNow + 50000);

      // Bid after new deadline
      await expect(
        market.connect(userWith20Token).bid(listingId, 15)
      ).to.be.revertedWith('The auction has ended');
    });

    it('should emit the right events', async () => {
      const listingId = await market.getLatestListItemId();

      expect(market.connect(userWith20Token).bid(listingId, 10)).to.emit(
        market.address,
        'AuctionExtended'
      );
    });
  });

  xdescribe('721 auction bid cancellation', async () => {
    beforeEach(async function () {
      const timestamp = await getTimestamp();
      await market
        .connect(userWith721NFT)
        .createAuctionMarketItem(
          nft721.address,
          1,
          erc20.address,
          10,
          timestamp + 5000
        );
    });

    it('works', async () => {
      const listingId = await market.getLatestListItemId();

      await market.connect(userWith20Token).bid(listingId, 20);
      await market.connect(userWith20Token).cancelBid(listingId, 0);

      const bids = await market.getAuctionBids(listingId);

      expect(bids.length).to.equal(1);
      expect(bids[0].isCanceled).to.true;
    });

    it('works when multiple bids', async () => {
      const listingId = await market.getLatestListItemId();

      await erc20.connect(user1).freeMint(erc20MintAmount);
      await erc20.connect(user1).approve(market.address, erc20MintAmount);

      await erc20.connect(user2).freeMint(erc20MintAmount);
      await erc20.connect(user2).approve(market.address, erc20MintAmount);

      await market.connect(userWith20Token).bid(listingId, 20);
      await market.connect(user1).bid(listingId, 30);
      await market.connect(user2).bid(listingId, 40);

      await market.connect(user1).cancelBid(listingId, 1);

      const bids = await market.getAuctionBids(listingId);

      expect(bids.length).to.equal(3);
      expect(bids[0].isCanceled).to.false;
      expect(bids[1].isCanceled).to.true;
      expect(bids[2].isCanceled).to.false;
    });

    it('should emit the correct events', async () => {
      const listingId = await market.getLatestListItemId();

      await market.connect(userWith20Token).bid(listingId, 20);

      await expect(market.connect(userWith20Token).cancelBid(listingId, 0))
        .to.emit(market, 'AuctionBidCancelled')
        .withArgs(1, 0);
    });

    it('should fail if paused', async () => {
      const listingId = await market.getLatestListItemId();

      await market.connect(userWith20Token).bid(listingId, 20);
      await market.connect(deployer).pause();
      await expect(
        market.connect(userWith20Token).cancelBid(listingId, 0)
      ).to.be.revertedWith('Pausable: paused');
    });

    it("should fail if listing doesn't exist", async () => {
      const listingId = await market.getLatestListItemId();

      await market.connect(userWith20Token).bid(listingId, 20);

      await expect(
        market.connect(userWith20Token).cancelBid(listingId.add(1), 0)
      ).to.revertedWith("Listing doesn't exist");
    });

    it('should fail if auction has been closed', async () => {
      const listingId = await market.getLatestListItemId();
      await market.connect(userWith20Token).bid(listingId, 20);

      await market.connect(userWith721NFT).acceptBid(listingId, 0);

      await expect(
        market.connect(userWith20Token).cancelBid(listingId, 0)
      ).to.be.revertedWith('Listing is closed');
    });

    it('should fail if auction has been ended', async () => {
      const listingId = await market.getLatestListItemId();
      await market.connect(userWith20Token).bid(listingId, 20);

      await nextDay();

      await expect(
        market.connect(userWith20Token).cancelBid(listingId, 0)
      ).to.be.revertedWith('The auction has ended');
    });

    it('should fail for non-existing bid', async () => {
      const listingId = await market.getLatestListItemId();
      await market.connect(userWith20Token).bid(listingId, 20);

      await expect(
        market.connect(userWith20Token).cancelBid(listingId, 1)
      ).to.be.revertedWith("Bid doesn't exist");

      await expect(
        market.connect(userWith20Token).cancelBid(listingId, 50)
      ).to.be.revertedWith("Bid doesn't exist");
    });

    it('should fail if non-owner tries to cancel', async () => {
      const listingId = await market.getLatestListItemId();

      await market.connect(userWith20Token).bid(listingId, 20);

      await expect(
        market.connect(user1).cancelBid(listingId, 0)
      ).to.be.revertedWith('Only owner can cancel');
    });

    it('should fail if already canceled', async () => {
      const listingId = await market.getLatestListItemId();

      await market.connect(userWith20Token).bid(listingId, 20);
      await market.connect(userWith20Token).cancelBid(listingId, 0);

      await expect(
        market.connect(userWith20Token).cancelBid(listingId, 0)
      ).to.be.revertedWith('Already canceled');
    });
  });

  xdescribe('721 finding the best bid', async () => {
    beforeEach(async function () {
      const timestamp = await getTimestamp();
      await market
        .connect(userWith721NFT)
        .createAuctionMarketItem(
          nft721.address,
          1,
          erc20.address,
          1,
          timestamp + 5000
        );

      await erc20.connect(user1).freeMint(erc20MintAmount);
      await erc20.connect(user1).approve(market.address, erc20MintAmount);

      await erc20.connect(user2).freeMint(erc20MintAmount);
      await erc20.connect(user2).approve(market.address, erc20MintAmount);
    });

    describe('Bids are in ascending order', async () => {
      it('works with single bid', async () => {
        const listingId = await market.getLatestListItemId();

        await market.connect(userWith20Token).bid(listingId, 10);

        const bids = await market.getAuctionBids(listingId);
        const best = await market.getBestBid(bids, erc20.address);

        expect(best.bidAmount).to.equal(10);
        expect(best.bidder).to.equal(userWith20Token.address);
      });

      it('works with no bids', async () => {
        const listingId = await market.getLatestListItemId();

        const bids = await market.getAuctionBids(listingId);
        const best = await market.getBestBid(bids, erc20.address);

        expect(best.bidAmount).to.equal(0);
        expect(best.bidder).to.equal(ethers.constants.AddressZero);
      });

      it('works with multiple bids', async () => {
        const listingId = await market.getLatestListItemId();

        await market.connect(userWith20Token).bid(listingId, 10);
        await market.connect(user1).bid(listingId, 11);
        await market.connect(user2).bid(listingId, 12);

        const bids = await market.getAuctionBids(listingId);
        const best = await market.getBestBid(bids, erc20.address);

        expect(best.bidAmount).to.equal(12);
        expect(best.bidder).to.equal(user2.address);
      });

      it('chooses second best when no allowance with first', async () => {
        const listingId = await market.getLatestListItemId();

        await market.connect(userWith20Token).bid(listingId, 10);
        await market.connect(user1).bid(listingId, 11);
        await market.connect(user2).bid(listingId, 12);

        await erc20.connect(user2).approve(market.address, 0);

        const bids = await market.getAuctionBids(listingId);
        const best = await market.getBestBid(bids, erc20.address);

        expect(best.bidAmount).to.equal(11);
        expect(best.bidder).to.equal(user1.address);
      });

      it('chooses second best when first bid is canceled', async () => {
        const listingId = await market.getLatestListItemId();

        await market.connect(userWith20Token).bid(listingId, 10);
        await market.connect(user1).bid(listingId, 11);
        await market.connect(user2).bid(listingId, 12);

        await market.connect(user2).cancelBid(listingId, 2);

        const bids = await market.getAuctionBids(listingId);
        const best = await market.getBestBid(bids, erc20.address);

        expect(best.bidAmount).to.equal(11);
        expect(best.bidder).to.equal(user1.address);
      });

      it('chooses second best when no tokens with first', async () => {
        const listingId = await market.getLatestListItemId();

        await market.connect(userWith20Token).bid(listingId, 10);
        await market.connect(user1).bid(listingId, 11);
        await market.connect(user2).bid(listingId, 12);

        await erc20.connect(user2).transfer(user1.address, erc20MintAmount);

        const bids = await market.getAuctionBids(listingId);
        const best = await market.getBestBid(bids, erc20.address);

        expect(best.bidAmount).to.equal(11);
        expect(best.bidder).to.equal(user1.address);
      });

      it('chooses last when no allowance with others', async () => {
        const listingId = await market.getLatestListItemId();

        await market.connect(userWith20Token).bid(listingId, 10);
        await market.connect(user2).bid(listingId, 11);
        await market.connect(user1).bid(listingId, 12);
        await market.connect(user2).bid(listingId, 13);

        await erc20.connect(user1).approve(market.address, 0);
        await erc20.connect(user2).approve(market.address, 0);

        const bids = await market.getAuctionBids(listingId);
        const best = await market.getBestBid(bids, erc20.address);

        expect(best.bidAmount).to.equal(10);
        expect(best.bidder).to.equal(userWith20Token.address);
      });

      it('chooses last when no tokens with others', async () => {
        const listingId = await market.getLatestListItemId();

        await market.connect(userWith20Token).bid(listingId, 10);
        await market.connect(user2).bid(listingId, 11);
        await market.connect(user1).bid(listingId, 12);
        await market.connect(user2).bid(listingId, 13);

        await erc20
          .connect(user1)
          .transfer(userWith20Token.address, erc20MintAmount);
        await erc20
          .connect(user2)
          .transfer(userWith20Token.address, erc20MintAmount);

        const bids = await market.getAuctionBids(listingId);
        const best = await market.getBestBid(bids, erc20.address);

        expect(best.bidAmount).to.equal(10);
        expect(best.bidder).to.equal(userWith20Token.address);
      });

      it('no bid found when no allowance', async () => {
        const listingId = await market.getLatestListItemId();

        await market.connect(userWith20Token).bid(listingId, 10);
        await market.connect(user2).bid(listingId, 11);
        await market.connect(user1).bid(listingId, 12);
        await market.connect(user2).bid(listingId, 13);

        await erc20.connect(user1).approve(market.address, 0);
        await erc20.connect(user2).approve(market.address, 0);
        await erc20.connect(userWith20Token).approve(market.address, 0);

        const bids = await market.getAuctionBids(listingId);
        const best = await market.getBestBid(bids, erc20.address);

        expect(best.bidAmount).to.equal(0);
        expect(best.bidder).to.equal(ethers.constants.AddressZero);
      });

      it('no bid found when no tokens', async () => {
        const listingId = await market.getLatestListItemId();

        await market.connect(userWith20Token).bid(listingId, 10);
        await market.connect(user2).bid(listingId, 11);
        await market.connect(user1).bid(listingId, 12);
        await market.connect(user2).bid(listingId, 13);

        await erc20.connect(user1).transfer(deployer.address, erc20MintAmount);
        await erc20.connect(user2).transfer(deployer.address, erc20MintAmount);
        await erc20
          .connect(userWith20Token)
          .transfer(deployer.address, erc20MintAmount);

        const bids = await market.getAuctionBids(listingId);
        const best = await market.getBestBid(bids, erc20.address);

        expect(best.bidAmount).to.equal(0);
        expect(best.bidder).to.equal(ethers.constants.AddressZero);
      });
    });

    describe('Bids are not in ascending order', async () => {
      it('works with multiple bids when winner bids first', async () => {
        const listingId = await market.getLatestListItemId();

        await market.connect(user2).bid(listingId, 12);
        await market.connect(userWith20Token).bid(listingId, 10);
        await market.connect(user1).bid(listingId, 11);

        const bids = await market.getAuctionBids(listingId);
        const best = await market.getBestBid(bids, erc20.address);

        expect(best.bidAmount).to.equal(12);
        expect(best.bidder).to.equal(user2.address);
      });

      it('works with multiple bids when winner bids in the middle', async () => {
        const listingId = await market.getLatestListItemId();

        await market.connect(userWith20Token).bid(listingId, 10);
        await market.connect(user2).bid(listingId, 12);
        await market.connect(user1).bid(listingId, 11);

        const bids = await market.getAuctionBids(listingId);
        const best = await market.getBestBid(bids, erc20.address);

        expect(best.bidAmount).to.equal(12);
        expect(best.bidder).to.equal(user2.address);
      });

      it('chooses second best when no allowance with first', async () => {
        const listingId = await market.getLatestListItemId();

        await market.connect(user2).bid(listingId, 12);
        await market.connect(userWith20Token).bid(listingId, 10);
        await market.connect(user1).bid(listingId, 11);

        await erc20.connect(user2).approve(market.address, 0);

        const bids = await market.getAuctionBids(listingId);
        const best = await market.getBestBid(bids, erc20.address);

        expect(best.bidAmount).to.equal(11);
        expect(best.bidder).to.equal(user1.address);
      });

      it('chooses second best when no tokens with first', async () => {
        const listingId = await market.getLatestListItemId();

        await market.connect(userWith20Token).bid(listingId, 10);
        await market.connect(user2).bid(listingId, 12);
        await market.connect(user1).bid(listingId, 11);

        await erc20.connect(user2).transfer(user1.address, erc20MintAmount);

        const bids = await market.getAuctionBids(listingId);
        const best = await market.getBestBid(bids, erc20.address);

        expect(best.bidAmount).to.equal(11);
        expect(best.bidder).to.equal(user1.address);
      });

      it('chooses last when no allowance with others', async () => {
        const listingId = await market.getLatestListItemId();

        await market.connect(user2).bid(listingId, 11);
        await market.connect(user2).bid(listingId, 13);
        await market.connect(userWith20Token).bid(listingId, 10);

        await market.connect(user1).bid(listingId, 12);

        await erc20.connect(user1).approve(market.address, 0);
        await erc20.connect(user2).approve(market.address, 0);

        const bids = await market.getAuctionBids(listingId);
        const best = await market.getBestBid(bids, erc20.address);

        expect(best.bidAmount).to.equal(10);
        expect(best.bidder).to.equal(userWith20Token.address);
      });

      it('chooses last when no tokens with others', async () => {
        const listingId = await market.getLatestListItemId();

        await market.connect(user1).bid(listingId, 12);
        await market.connect(userWith20Token).bid(listingId, 10);
        await market.connect(user2).bid(listingId, 11);
        await market.connect(user2).bid(listingId, 13);

        await erc20
          .connect(user1)
          .transfer(userWith20Token.address, erc20MintAmount);
        await erc20
          .connect(user2)
          .transfer(userWith20Token.address, erc20MintAmount);

        const bids = await market.getAuctionBids(listingId);
        const best = await market.getBestBid(bids, erc20.address);

        expect(best.bidAmount).to.equal(10);
        expect(best.bidder).to.equal(userWith20Token.address);
      });

      it('no bid found when no allowance', async () => {
        const listingId = await market.getLatestListItemId();

        await market.connect(userWith20Token).bid(listingId, 10);
        await market.connect(user2).bid(listingId, 13);
        await market.connect(user2).bid(listingId, 11);
        await market.connect(user1).bid(listingId, 12);

        await erc20.connect(user1).approve(market.address, 0);
        await erc20.connect(user2).approve(market.address, 0);
        await erc20.connect(userWith20Token).approve(market.address, 0);

        const bids = await market.getAuctionBids(listingId);
        const best = await market.getBestBid(bids, erc20.address);

        expect(best.bidAmount).to.equal(0);
        expect(best.bidder).to.equal(ethers.constants.AddressZero);
      });

      it('no bid found when no tokens', async () => {
        const listingId = await market.getLatestListItemId();

        await market.connect(user1).bid(listingId, 12);
        await market.connect(user2).bid(listingId, 13);
        await market.connect(userWith20Token).bid(listingId, 10);
        await market.connect(user2).bid(listingId, 11);

        await erc20.connect(user1).transfer(deployer.address, erc20MintAmount);
        await erc20.connect(user2).transfer(deployer.address, erc20MintAmount);
        await erc20
          .connect(userWith20Token)
          .transfer(deployer.address, erc20MintAmount);

        const bids = await market.getAuctionBids(listingId);
        const best = await market.getBestBid(bids, erc20.address);

        expect(best.bidAmount).to.equal(0);
        expect(best.bidder).to.equal(ethers.constants.AddressZero);
      });
    });
  });

  xdescribe('721 auction bid acceptance', async () => {
    beforeEach(async function () {
      const timestamp = await getTimestamp();
      await market
        .connect(userWith721NFT)
        .createAuctionMarketItem(
          nft721.address,
          1,
          erc20.address,
          10,
          timestamp + 5000
        );
    });

    it('with bidder transfers NFT', async () => {
      const listingId = await market.getLatestListItemId();

      await market.connect(userWith20Token).bid(listingId, 20);

      const ownerBefore = await nft721.ownerOf(1);
      const sellerListedAmountBefore = await market.userListedTokens(
        userWith721NFT.address,
        nft721.address,
        1
      );

      await market.connect(userWith721NFT).acceptBid(listingId, 0);

      const ownerAfter = await nft721.ownerOf(1);

      const sellerListedAmountAfter = await market.userListedTokens(
        userWith721NFT.address,
        nft721.address,
        1
      );

      expect(ownerBefore).to.equal(userWith721NFT.address);
      expect(ownerAfter).to.equal(userWith20Token.address);
      expect(sellerListedAmountBefore).to.equal(1);
      expect(sellerListedAmountAfter).to.equal(0);
    });

    it('with bidder transfers ERC20 (buyer, seller, commission)', async () => {
      const listingId = await market.getLatestListItemId();

      await market.connect(userWith20Token).bid(listingId, 202);

      await expect(() =>
        market.connect(userWith721NFT).acceptBid(listingId, 0)
      ).to.changeTokenBalances(
        erc20,
        [userWith20Token, userWith721NFT, deployer],
        [-202, 200, 2]
      );
    });

    it('can accept any of multiple bids', async () => {
      const listingId = await market.getLatestListItemId();

      await erc20.connect(user1).freeMint(1000);
      await erc20.connect(user2).freeMint(1000);

      await erc20.connect(user1).approve(market.address, 1000);
      await erc20.connect(user2).approve(market.address, 1000);

      await market.connect(userWith20Token).bid(listingId, 30);
      await market.connect(user1).bid(listingId, 75);
      await market.connect(user1).bid(listingId, 35);
      await market.connect(user2).bid(listingId, 40);
      await market.connect(user1).bid(listingId, 50);
      await market.connect(user2).bid(listingId, 140);

      const ownerBefore = await nft721.ownerOf(1);
      const sellerListedAmountBefore = await market.userListedTokens(
        userWith721NFT.address,
        nft721.address,
        1
      );

      await expect(() =>
        market.connect(userWith721NFT).acceptBid(listingId, 2)
      ).to.changeTokenBalances(
        erc20,
        [userWith20Token, userWith721NFT, user1, user2],
        [0, 35, -35, 0]
      );

      const ownerAfter = await nft721.ownerOf(1);

      const sellerListedAmountAfter = await market.userListedTokens(
        userWith721NFT.address,
        nft721.address,
        1
      );

      expect(ownerBefore).to.equal(userWith721NFT.address);
      expect(ownerAfter).to.equal(user1.address);
      expect(sellerListedAmountBefore).to.equal(1);
      expect(sellerListedAmountAfter).to.equal(0);
    });

    it('can accept a bid even after the auction has expired', async () => {
      const listingId = await market.getLatestListItemId();

      await market.connect(userWith20Token).bid(listingId, 30);

      await nextDay();
      await expect(() =>
        market.connect(userWith721NFT).acceptBid(listingId, 0)
      ).to.changeTokenBalances(
        erc20,
        [userWith20Token, userWith721NFT],
        [-30, 30]
      );
    });

    it('should emit the correct events', async () => {
      const listingId = await market.getLatestListItemId();

      await market.connect(userWith20Token).bid(listingId, 20);

      await expect(market.connect(userWith721NFT).acceptBid(listingId, 0))
        .to.emit(market, 'AuctionBidAccepted')
        .withArgs(1, 0);
    });

    it('should fail if paused', async () => {
      const listingId = await market.getLatestListItemId();

      await market.connect(userWith20Token).bid(listingId, 20);

      await market.connect(deployer).pause();
      await expect(
        market.connect(userWith721NFT).acceptBid(listingId, 0)
      ).to.be.revertedWith('Pausable: paused');
    });

    it("should fail if listing doesn't exist", async () => {
      const listingId = await market.getLatestListItemId();

      await market.connect(userWith20Token).bid(listingId, 20);

      await expect(
        market.connect(userWith721NFT).acceptBid(listingId.add(1), 0)
      ).to.revertedWith("Listing doesn't exist");
    });

    it('should fail if auction has been closed already due to termination', async () => {
      const listingId = await market.getLatestListItemId();
      await market.connect(userWith20Token).bid(listingId, 20);
      await nextDay();
      await market.terminateAuction(listingId);

      await expect(
        market.connect(userWith721NFT).acceptBid(listingId, 0)
      ).to.be.revertedWith('Listing is closed');
    });

    it('should fail if auction has been closed already due to acceptance', async () => {
      const listingId = await market.getLatestListItemId();

      await market.connect(userWith20Token).bid(listingId, 20);
      await market.connect(userWith721NFT).acceptBid(listingId, 0);

      await expect(
        market.connect(userWith721NFT).acceptBid(listingId, 0)
      ).to.be.revertedWith('Listing is closed');
    });

    it('should fail when the bid has been canceled', async () => {
      const listingId = await market.getLatestListItemId();
      await market.connect(userWith20Token).bid(listingId, 30);
      await market.connect(userWith20Token).cancelBid(listingId, 0);

      await expect(
        market.connect(userWith721NFT).acceptBid(listingId, 0)
      ).to.be.revertedWith('Not a valid bid');
    });

    it("should fail when the bid doesn't exist", async () => {
      const listingId = await market.getLatestListItemId();

      await expect(
        market.connect(userWith721NFT).acceptBid(listingId, 0)
      ).to.be.revertedWith("Bid doesn't exist");

      await expect(
        market.connect(userWith721NFT).acceptBid(listingId, 10)
      ).to.be.revertedWith("Bid doesn't exist");
    });

    it('should fail when non-owner tries to accept', async () => {
      const listingId = await market.getLatestListItemId();

      await expect(
        market.connect(user1).acceptBid(listingId, 0)
      ).to.be.revertedWith('Only owner can accept');
    });

    it('should fail if the seller no longer has the NFT', async () => {
      const listingId = await market.getLatestListItemId();

      await market.connect(userWith20Token).bid(listingId, 20);
      await nft721
        .connect(userWith721NFT)
        .transferFrom(userWith721NFT.address, user2.address, 1);

      await expect(
        market.connect(userWith721NFT).acceptBid(listingId, 0)
      ).to.revertedWith("Seller doesn't have the NFT");
    });

    it('should fail if the buyer no longer has allowance', async () => {
      const listingId = await market.getLatestListItemId();
      await market.connect(userWith20Token).bid(listingId, 10);

      await erc20.connect(userWith20Token).approve(market.address, 0);

      await expect(
        market.connect(userWith721NFT).acceptBid(listingId, 0)
      ).to.be.revertedWith('Not a valid bid');
    });

    it('should fail if the buyer no longer has price tokens', async () => {
      const listingId = await market.getLatestListItemId();
      await market.connect(userWith20Token).bid(listingId, 10);

      await erc20
        .connect(userWith20Token)
        .transfer(user2.address, erc20MintAmount);

      await expect(
        market.connect(userWith721NFT).acceptBid(listingId, 0)
      ).to.be.revertedWith('Not a valid bid');
    });
  });

  xdescribe('721 auction termination', async () => {
    beforeEach(async function () {
      const timestamp = await getTimestamp();
      await market
        .connect(userWith721NFT)
        .createAuctionMarketItem(
          nft721.address,
          1,
          erc20.address,
          10,
          timestamp + 5000
        );
    });

    it('termination with bidder transfers NFT', async () => {
      const listingId = await market.getLatestListItemId();

      await market.connect(userWith20Token).bid(listingId, 20);

      await nextDay();

      const ownerBefore = await nft721.ownerOf(1);
      const sellerListedAmountBefore = await market.userListedTokens(
        userWith721NFT.address,
        nft721.address,
        1
      );

      await market.terminateAuction(listingId);

      const ownerAfter = await nft721.ownerOf(1);

      const sellerListedAmountAfter = await market.userListedTokens(
        userWith721NFT.address,
        nft721.address,
        1
      );

      expect(ownerBefore).to.equal(userWith721NFT.address);
      expect(ownerAfter).to.equal(userWith20Token.address);
      expect(sellerListedAmountBefore).to.equal(1);
      expect(sellerListedAmountAfter).to.equal(0);
    });

    it('termination with bidder transfers ERC20 (buyer, seller, commission)', async () => {
      const listingId = await market.getLatestListItemId();

      await market.connect(userWith20Token).bid(listingId, 202);

      await nextDay();

      await expect(() =>
        market.terminateAuction(listingId)
      ).to.changeTokenBalances(
        erc20,
        [userWith20Token, userWith721NFT, deployer],
        [-202, 200, 2]
      );
    });

    it('termination with no bidders works', async () => {
      const listingId = await market.getLatestListItemId();

      await nextDay();

      await market.terminateAuction(listingId);

      const listedTokens = await market.userListedTokens(
        userWith721NFT.address,
        nft721.address,
        1
      );
      const listing = await market.auctionListingIdToMarketItem(listingId);

      expect(listedTokens).to.equal(0);
      expect(listing.isClosed).to.equal(true);
    });

    it('termination, when bidders have no allowance, terminates', async () => {
      const listingId = await market.getLatestListItemId();
      await market.connect(userWith20Token).bid(listingId, 10);
      await nextDay();

      await erc20.connect(userWith20Token).approve(market.address, 0);
      await market.terminateAuction(listingId);

      const listedTokens = await market.userListedTokens(
        userWith721NFT.address,
        nft721.address,
        1
      );
      const listing = await market.auctionListingIdToMarketItem(listingId);

      expect(listedTokens).to.equal(0);
      expect(listing.isClosed).to.equal(true);
    });

    it('termination, when bidders have no tokens, terminates', async () => {
      const listingId = await market.getLatestListItemId();
      await market.connect(userWith20Token).bid(listingId, 10);
      await nextDay();

      await erc20
        .connect(userWith20Token)
        .transfer(user2.address, erc20MintAmount);

      await market.terminateAuction(listingId);

      const listedTokens = await market.userListedTokens(
        userWith721NFT.address,
        nft721.address,
        1
      );
      const listing = await market.auctionListingIdToMarketItem(listingId);

      expect(listedTokens).to.equal(0);
      expect(listing.isClosed).to.equal(true);
    });

    it('should emit the correct events', async () => {
      const listingId = await market.getLatestListItemId();

      await market.connect(userWith20Token).bid(listingId, 20);

      await nextDay();

      await expect(market.terminateAuction(listingId))
        .to.emit(market, 'AuctionTerminated')
        .withArgs(1);
    });

    it('should fail if paused', async () => {
      const listingId = await market.getLatestListItemId();

      await market.connect(userWith20Token).bid(listingId, 20);

      await nextDay();

      await market.connect(deployer).pause();
      await expect(market.terminateAuction(listingId)).to.be.revertedWith(
        'Pausable: paused'
      );
    });

    it("should fail if listing doesn't exist", async () => {
      const listingId = await market.getLatestListItemId();

      await market.connect(userWith20Token).bid(listingId, 20);

      await nextDay();

      await market.terminateAuction(listingId);

      await expect(market.terminateAuction(listingId.add(1))).to.revertedWith(
        "Listing doesn't exist"
      );
    });

    it('should fail if auction has been closed due to cancellation', async () => {
      const listingId = await market.getLatestListItemId();
      await nextDay();
      await market.connect(userWith721NFT).cancelAuctionListing(listingId);

      await expect(market.terminateAuction(listingId)).to.be.revertedWith(
        'Already closed'
      );
    });

    it('should fail if auction has been closed due to termination', async () => {
      const listingId = await market.getLatestListItemId();
      await nextDay();
      await market.terminateAuction(listingId);

      await expect(market.terminateAuction(listingId)).to.be.revertedWith(
        'Already closed'
      );
    });

    it('should fail if auction has been closed due to acceptance', async () => {
      const listingId = await market.getLatestListItemId();
      await market.connect(userWith20Token).bid(listingId, 20);

      await market.connect(userWith721NFT).acceptBid(listingId, 0);

      await expect(market.terminateAuction(listingId)).to.be.revertedWith(
        'Already closed'
      );
    });

    it("should fail when auction hasn't ended", async () => {
      const listingId = await market.getLatestListItemId();

      await expect(market.terminateAuction(listingId)).to.be.revertedWith(
        "The auction hasn't ended"
      );
    });

    it('should fail if the seller no longer has the NFT', async () => {
      const listingId = await market.getLatestListItemId();

      await market.connect(userWith20Token).bid(listingId, 20);
      await nft721
        .connect(userWith721NFT)
        .transferFrom(userWith721NFT.address, user2.address, 1);

      await nextDay();

      await expect(market.terminateAuction(listingId)).to.revertedWith(
        "Seller doesn't have the NFT"
      );
    });
  });

  xdescribe('721 auction cancellation', async () => {
    beforeEach(async function () {
      const timestamp = await getTimestamp();
      await market
        .connect(userWith721NFT)
        .createAuctionMarketItem(
          nft721.address,
          1,
          erc20.address,
          1,
          timestamp + 5000
        );
    });

    it('should be able to cancel', async () => {
      const listingId = await market.getLatestListItemId();
      await market.connect(userWith721NFT).cancelAuctionListing(listingId);

      const res = await market.auctionListingIdToMarketItem(listingId);
      const listedAmount = await market.userListedTokens(
        userWith20Token.address,
        nft721.address,
        1
      );

      expect(res.isClosed).to.equal(true);
      expect(listedAmount).to.equal(0);
    });

    it('should be able to cancel even if there are bids', async () => {
      const listingId = await market.getLatestListItemId();

      await erc20.connect(userWith20Token).transfer(user1.address, 10);
      await erc20.connect(user1).approve(market.address, 10);
      await market.connect(user1).bid(listingId, 5);

      await market.connect(userWith721NFT).cancelAuctionListing(listingId);

      const res = await market.auctionListingIdToMarketItem(listingId);
      expect(res.isClosed).to.equal(true);
    });

    it('should emit the correct events', async () => {
      const listingId = await market.getLatestListItemId();
      await expect(
        market.connect(userWith721NFT).cancelAuctionListing(listingId)
      )
        .to.emit(market, 'AuctionCancelled')
        .withArgs(1);
    });

    it('should fail if paused', async () => {
      const listingId = await market.getLatestListItemId();

      await market.connect(deployer).pause();
      await expect(
        market.connect(userWith721NFT).cancelAuctionListing(listingId)
      ).to.be.revertedWith('Pausable: paused');
    });

    it('fails for non-existing listing', async () => {
      const listingId = await market.getLatestListItemId();

      await expect(
        market.connect(user2).cancelAuctionListing(listingId.add(5))
      ).to.revertedWith("Listing doesn't exist");
    });

    it('fails if not your listing', async () => {
      const listingId = await market.getLatestListItemId();

      await expect(
        market.connect(user2).cancelAuctionListing(listingId)
      ).to.revertedWith('Only owner can cancel');
    });

    it('fails if auction has been closed due to cancellation', async () => {
      const listingId = await market.getLatestListItemId();

      await market.connect(userWith721NFT).cancelAuctionListing(listingId);

      await expect(
        market.connect(userWith721NFT).cancelAuctionListing(listingId)
      ).to.revertedWith('Already closed');
    });

    it('fails if auction has been closed due to termination', async () => {
      const listingId = await market.getLatestListItemId();

      await nextDay();

      await market.terminateAuction(listingId);

      await expect(
        market.connect(userWith721NFT).cancelAuctionListing(listingId)
      ).to.revertedWith('Already closed');
    });
  });

  xdescribe('1155-specific auction creation', async () => {
    // Only tests which test functionality which differs from 721
    it('should create a correct 1155 auction marketitem', async () => {
      await market
        .connect(userWith1155NFT)
        .createAuctionMarketItem(
          nft1155.address,
          1,
          erc20.address,
          100,
          dummyDeadline
        );
      const listingId = await market.getLatestListItemId();
      const res = await market.auctionListingIdToMarketItem(listingId);
      const bids = await market.getAuctionBids(listingId);
      const listedAmount = await market.userListedTokens(
        userWith1155NFT.address,
        nft1155.address,
        1
      );

      expect(res.nftContract).to.equal(nft1155.address);
      expect(res.nftTokenId).to.equal(1);
      expect(res.priceTokenAddress).to.equal(erc20.address);
      expect(res.startPrice).to.equal(100);
      expect(res.ownerAddress).to.equal(userWith1155NFT.address);
      expect(res.deadline).to.equal(dummyDeadline);
      expect(res.isClosed).to.false;

      expect(bids.length).to.equal(0);

      expect(listedAmount).to.equal(1);
    });

    it('should allow creating a new auction for the same token after sale terminates / cancels', async () => {
      let timestamp = await getTimestamp();
      await market
        .connect(userWith1155NFT)
        .createAuctionMarketItem(
          nft1155.address,
          1,
          erc20.address,
          100,
          timestamp + 5000
        );
      let listingId = await market.getLatestListItemId();

      await market.connect(userWith20Token).bid(listingId, 101);
      await nextDay();
      await market.terminateAuction(listingId);

      timestamp = await getTimestamp();
      await market
        .connect(userWith1155NFT)
        .createAuctionMarketItem(
          nft1155.address,
          1,
          erc20.address,
          100,
          timestamp + 5000
        );
      listingId = await market.getLatestListItemId();

      const res = await market.auctionListingIdToMarketItem(listingId);
      const bids = await market.getAuctionBids(listingId);
      const listedAmount = await market.userListedTokens(
        userWith1155NFT.address,
        nft1155.address,
        1
      );

      expect(res.nftContract).to.equal(nft1155.address);
      expect(res.nftTokenId).to.equal(1);
      expect(res.priceTokenAddress).to.equal(erc20.address);
      expect(res.startPrice).to.equal(100);
      expect(res.ownerAddress).to.equal(userWith1155NFT.address);
      expect(res.isClosed).to.false;

      expect(bids.length).to.equal(0);

      expect(listedAmount).to.equal(1);
    });

    it('should allow creating a new auction for the same token after sale cancels', async () => {
      let timestamp = await getTimestamp();
      await market
        .connect(userWith1155NFT)
        .createAuctionMarketItem(
          nft1155.address,
          1,
          erc20.address,
          100,
          timestamp + 5000
        );
      let listingId = await market.getLatestListItemId();

      await market.connect(userWith20Token).bid(listingId, 101);
      await nextDay();
      await market.connect(userWith1155NFT).cancelAuctionListing(listingId);

      timestamp = await getTimestamp();
      await market
        .connect(userWith1155NFT)
        .createAuctionMarketItem(
          nft1155.address,
          1,
          erc20.address,
          100,
          timestamp + 5000
        );
      listingId = await market.getLatestListItemId();

      const res = await market.auctionListingIdToMarketItem(listingId);
      const bids = await market.getAuctionBids(listingId);
      const listedAmount = await market.userListedTokens(
        userWith1155NFT.address,
        nft1155.address,
        1
      );

      expect(res.nftContract).to.equal(nft1155.address);
      expect(res.nftTokenId).to.equal(1);
      expect(res.priceTokenAddress).to.equal(erc20.address);
      expect(res.startPrice).to.equal(100);
      expect(res.ownerAddress).to.equal(userWith1155NFT.address);
      expect(res.isClosed).to.false;

      expect(bids.length).to.equal(0);

      expect(listedAmount).to.equal(1);
    });

    it('should fail if no allowance', async () => {
      await nft1155
        .connect(userWith1155NFT)
        .setApprovalForAll(market.address, false);
      await expect(
        market
          .connect(userWith1155NFT)
          .createAuctionMarketItem(
            nft1155.address,
            1,
            erc20.address,
            100,
            dummyDeadline
          )
      ).to.be.revertedWith('Not allowed to manage tokens');
    });

    it('should fail if already listed', async () => {
      await market
        .connect(userWith1155NFT)
        .createAuctionMarketItem(
          nft1155.address,
          1,
          erc20.address,
          100,
          dummyDeadline
        );
      await expect(
        market
          .connect(userWith1155NFT)
          .createAuctionMarketItem(
            nft1155.address,
            1,
            erc20.address,
            100,
            dummyDeadline
          )
      ).to.be.revertedWith('A listing already exists for the token');
    });

    it("should fail if trying to list NFT you don't own", async () => {
      await expect(
        market
          .connect(user1)
          .createAuctionMarketItem(
            nft1155.address,
            1,
            erc20.address,
            100,
            dummyDeadline
          )
      ).to.be.revertedWith('Not enough NFTs');
    });
  });

  xdescribe('1155-specific auction bidding', async () => {
    // Only tests which test functionality which differs from 721
    beforeEach(async function () {
      const timestamp = await getTimestamp();
      await market
        .connect(userWith1155NFT)
        .createAuctionMarketItem(
          nft1155.address,
          1,
          erc20.address,
          1,
          timestamp + 5000
        );
    });

    it('should be able to place a bid', async () => {
      const listingId = await market.getLatestListItemId();

      await market.connect(userWith20Token).bid(listingId, 10);

      const bids = await market.getAuctionBids(listingId);

      expect(bids.length).to.equal(1);
      expect(bids[0].bidAmount).to.equal(10);
      expect(bids[0].bidder).to.equal(userWith20Token.address);
    });

    it('should fail if not enough allowance', async () => {
      const listingId = await market.getLatestListItemId();
      await expect(
        market.connect(userWith20Token).bid(listingId, erc20AllowanceAmount + 1)
      ).to.be.revertedWith('Not enough allowance');
    });

    it('should fail if not enough tokens', async () => {
      await erc20
        .connect(userWith20Token)
        .approve(market.address, erc20MintAmount + 1);

      const listingId = await market.getLatestListItemId();
      await expect(
        market.connect(userWith20Token).bid(listingId, erc20MintAmount + 1)
      ).to.be.revertedWith('Not enough tokens');
    });
  });

  xdescribe('1155-specific auction cancellation', async () => {
    beforeEach(async function () {
      const timestamp = await getTimestamp();
      await market
        .connect(userWith1155NFT)
        .createAuctionMarketItem(
          nft1155.address,
          1,
          erc20.address,
          100,
          timestamp + 5000
        );
    });

    it('should be able to cancel', async () => {
      const listingId = await market.getLatestListItemId();
      await market.connect(userWith1155NFT).cancelAuctionListing(listingId);

      const res = await market.auctionListingIdToMarketItem(listingId);
      const listedAmount = await market.userListedTokens(
        userWith20Token.address,
        nft1155.address,
        1
      );

      expect(res.isClosed).to.equal(true);
      expect(listedAmount).to.equal(0);
    });
  });

  xdescribe('1155-specific auction termination', async () => {
    beforeEach(async function () {
      const timestamp = await getTimestamp();
      await market
        .connect(userWith1155NFT)
        .createAuctionMarketItem(
          nft1155.address,
          1,
          erc20.address,
          10,
          timestamp + 5000
        );
    });

    it('termination with bidder transfers NFT', async () => {
      const listingId = await market.getLatestListItemId();

      await market.connect(userWith20Token).bid(listingId, 20);

      await nextDay();

      const sellerBalanceBefore = await nft1155.balanceOf(
        userWith1155NFT.address,
        1
      );
      const buyerBalanceBefore = await nft1155.balanceOf(
        userWith20Token.address,
        1
      );
      const sellerListedAmountBefore = await market.userListedTokens(
        userWith1155NFT.address,
        nft1155.address,
        1
      );

      await market.terminateAuction(listingId);

      const sellerBalanceAfter = await nft1155.balanceOf(
        userWith1155NFT.address,
        1
      );
      const buyerBalanceAfter = await nft1155.balanceOf(
        userWith20Token.address,
        1
      );

      const sellerListedAmountAfter = await market.userListedTokens(
        userWith1155NFT.address,
        nft1155.address,
        1
      );

      expect(sellerBalanceAfter.sub(sellerBalanceBefore)).to.equal(-1);
      expect(buyerBalanceAfter.sub(buyerBalanceBefore)).to.equal(1);
      expect(sellerListedAmountBefore).to.equal(1);
      expect(sellerListedAmountAfter).to.equal(0);
    });

    it('should work if the seller has less of the NFT, but enough', async () => {
      const listingId = await market.getLatestListItemId();

      await market.connect(userWith20Token).bid(listingId, 20);
      await nft1155
        .connect(userWith1155NFT)
        .safeTransferFrom(userWith1155NFT.address, user2.address, 1, 4, []);

      await nextDay();

      const buyerBalanceBefore = await nft1155.balanceOf(
        userWith20Token.address,
        1
      );

      await market.terminateAuction(listingId);

      const buyerBalanceAfter = await nft1155.balanceOf(
        userWith20Token.address,
        1
      );
      expect(buyerBalanceAfter.sub(buyerBalanceBefore)).to.equal(1);
    });

    it('should fail if the seller no longer has the NFT', async () => {
      const listingId = await market.getLatestListItemId();

      await market.connect(userWith20Token).bid(listingId, 20);
      await nft1155
        .connect(userWith1155NFT)
        .safeTransferFrom(userWith1155NFT.address, user2.address, 1, 5, []);

      await nextDay();

      await expect(market.terminateAuction(listingId)).to.revertedWith(
        "Seller doesn't have the NFT"
      );
    });
  });
});

xdescribe('Market contract with auction market buy, with royalties', async () => {
  let market: NFTMarketAuction,
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

    const Market = await ethers.getContractFactory('NFTMarketAuction');
    const NFT1155 = await ethers.getContractFactory('NFT1155');
    const NFT721 = await ethers.getContractFactory('NFT721');
    const Erc20 = await ethers.getContractFactory('MockERC20');

    erc20 = (await Erc20.connect(userWith20Token).deploy()) as MockERC20;
    market = (await Market.connect(deployer).deploy([
      erc20.address
    ])) as NFTMarketAuction;

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

    await erc20.connect(userWith20Token).freeMint(erc20MintAmount);
    await erc20
      .connect(userWith20Token)
      .approve(market.address, erc20AllowanceAmount);
  });

  describe('termination for 721 and 1155', async () => {
    beforeEach(async function () {
      const timestamp = await getTimestamp();
      await market
        .connect(userWith721NFT)
        .createAuctionMarketItem(
          nft721.address,
          1,
          erc20.address,
          100,
          timestamp + 5000
        );
    });
    it('first sale gives royalty correctly', async () => {
      const listingId = await market.getLatestListItemId();

      await market.connect(userWith20Token).bid(listingId, 101);
      await nextDay();

      await expect(() =>
        market.terminateAuction(listingId)
      ).to.changeTokenBalances(
        erc20,
        [user721Creator, userWith721NFT, userWith20Token],
        [3, 97, -101]
      );
    });

    it('second sale gives royalty correctly', async () => {
      let listingId = await market.getLatestListItemId();

      await market.connect(userWith20Token).bid(listingId, 101);
      await nextDay();
      await market.terminateAuction(listingId);

      await nft721
        .connect(userWith20Token)
        .setApprovalForAll(market.address, true);

      const timestamp = await getTimestamp();
      await market
        .connect(userWith20Token)
        .createAuctionMarketItem(
          nft721.address,
          1,
          erc20.address,
          100,
          timestamp + 5000
        );

      listingId = await market.getLatestListItemId();
      await erc20.connect(userWith20Token).transfer(user1.address, 202);
      await erc20.connect(user1).approve(market.address, 202);
      await market.connect(user1).bid(listingId, 202);
      await nextDay();

      await expect(() =>
        market.terminateAuction(listingId)
      ).to.changeTokenBalances(
        erc20,
        [user721Creator, userWith20Token, user1],
        [6, 194, -202]
      );
    });
  });
});

const getTimestamp = async () => {
  const block = await ethers.provider.getBlock('latest');
  return block.timestamp;
};

const increaseTime = async (time: number) => {
  await network.provider.send('evm_increaseTime', [time]);
  await network.provider.send('evm_mine');
};

const nextDay = async () => {
  const oneDay = 24 * 60 * 60;
  await increaseTime(oneDay);
};
