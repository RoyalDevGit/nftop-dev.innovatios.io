// This file is used for measuring certain gas costs. Enable when needed.

import '@nomiclabs/hardhat-waffle';

import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';
import { assert, expect } from 'chai';
import { ethers, network, waffle } from 'hardhat';

import {
  MockERC20,
  NFT721,
  NFT1155,
  NFTMarketAuction
} from '../typechain/pulse';

const dummyDeadline = 9000000000;
const erc20AllowanceAmount = 1000;
const erc20MintAmount = 10000;

// Enable only when you want to test high-gas actions. Disabled by default for performance reasons
xdescribe('Estimating gas costs', async () => {
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

  describe('for auction', async () => {
    it('highest bid search with lots of bids', async () => {
      const iterations = 1000;
      const listingId = await market.getLatestListItemId();

      await market.connect(userWith20Token).bid(listingId, 10);
      await market.connect(user1).bid(listingId, 11);
      for (let i = 0; i < iterations; i++) {
        await market.connect(user2).bid(listingId, 12 + i);
      }

      const bids = await market.getAuctionBids(listingId);
      const best = await market.getBestBid(bids, erc20.address);

      expect(best.bidAmount).to.equal(12 + iterations - 1);
      expect(best.bidder).to.equal(user2.address);
    });

    it('accepting an arbitrary bid works with lots of bids', async () => {
      const iterations = 1000;
      const listingId = await market.getLatestListItemId();

      await market.connect(userWith20Token).bid(listingId, 10);
      await market.connect(user1).bid(listingId, 11);
      for (let i = 0; i < iterations; i++) {
        await market.connect(user2).bid(listingId, 12 + i);
      }

      await market.connect(userWith721NFT).acceptBid(listingId, 5);
      const item = await market.auctionListingIdToMarketItem(listingId);
      expect(item.isClosed).true;
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
