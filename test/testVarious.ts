// This file is used for various minor tests

import '@nomiclabs/hardhat-waffle';

import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';
import { assert, expect } from 'chai';
import { deployMockContract } from 'ethereum-waffle';
import { ethers, network, waffle } from 'hardhat';

import {
  MarketTools__factory,
  MockERC20,
  NFT721,
  NFT1155,
  NFT1155__factory,
  NFTMarketAuction,
  NFTMarketOffers,
  NFTMarketSimple
} from '../typechain/pulse';

const dummyDeadline = 9000000000;

describe('Various minor functionalities', async () => {
  let offers: NFTMarketOffers,
    market: NFTMarketAuction,
    nft721: NFT721,
    nft1155: NFT1155,
    erc20: MockERC20,
    anotherErc20: MockERC20;
  let deployer: SignerWithAddress,
    user2: SignerWithAddress,
    userWithNFT: SignerWithAddress,
    userWithTokens: SignerWithAddress;

  beforeEach(async function () {
    const accounts = await ethers.getSigners();
    deployer = accounts[0];
    user2 = accounts[1];
    userWithNFT = accounts[2];
    userWithTokens = accounts[3];

    const Offers = await ethers.getContractFactory('NFTMarketOffers');
    const Erc20 = await ethers.getContractFactory('MockERC20');
    const Market = await ethers.getContractFactory('NFTMarketAuction');

    erc20 = (await Erc20.connect(userWithTokens).deploy()) as MockERC20;
    anotherErc20 = (await Erc20.connect(userWithTokens).deploy()) as MockERC20;
    offers = (await Offers.connect(deployer).deploy([
      erc20.address
    ])) as NFTMarketOffers;

    market = (await Market.connect(deployer).deploy([
      erc20.address
    ])) as NFTMarketAuction;

    await erc20.connect(userWithTokens).freeMint(1000);
    await erc20.connect(userWithTokens).approve(offers.address, 100);
  });

  describe('Pausability', async () => {
    beforeEach(async function () {
      const NFT721 = await ethers.getContractFactory('NFT721');
      nft721 = (await NFT721.connect(deployer).deploy()) as NFT721;
      await nft721.connect(userWithNFT).createToken('dummy', 0);
      await nft721.connect(userWithNFT).setApprovalForAll(offers.address, true);
    });

    it('pausing works', async () => {
      await market.connect(deployer).pause();
      const isPaused = await market.paused();
      expect(isPaused).true;
    });

    it('unpausing works', async () => {
      await market.connect(deployer).pause();
      await market.connect(deployer).unpause();
      const isPaused = await market.paused();
      expect(isPaused).false;
    });

    it("non-owner can't pause", async () => {
      await expect(market.connect(user2).pause()).to.be.revertedWith(
        'Ownable: caller is not the owner'
      );
    });

    it("non-owner can't unpause", async () => {
      await market.connect(deployer).pause();
      await expect(market.connect(user2).unpause()).to.be.revertedWith(
        'Ownable: caller is not the owner'
      );
    });
  });
});
