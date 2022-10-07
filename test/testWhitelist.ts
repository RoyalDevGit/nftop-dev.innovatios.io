import '@nomiclabs/hardhat-waffle';

import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';
import { assert, expect } from 'chai';
import { deployMockContract } from 'ethereum-waffle';
import { ContractFactory } from 'ethers';
import { ethers, network, waffle } from 'hardhat';

import {
  MockERC20,
  NFT721,
  NFT1155,
  NFT1155__factory,
  NFTMarketSimple
} from '../typechain/pulse';

describe('Whitelisting ERC20 tokens', async () => {
  let erc20: MockERC20;
  let deployer: SignerWithAddress,
    user1: SignerWithAddress,
    user2: SignerWithAddress,
    userWithTokens: SignerWithAddress;

  let Market: ContractFactory, Erc20: ContractFactory;

  describe('via constructor', async () => {
    beforeEach(async function () {
      const accounts = await ethers.getSigners();
      deployer = accounts[0];
      user1 = accounts[1];
      user2 = accounts[2];
      userWithTokens = accounts[3];

      Market = await ethers.getContractFactory('NFTMarketAuction');
      Erc20 = await ethers.getContractFactory('MockERC20');
    });

    it('should succeed with empty list', async () => {
      const market = await Market.connect(deployer).deploy([]);
      // Just test some random addresses
      const isWhitelisted1 = await market.whitelistedERC20(market.address);
      const isWhitelisted2 = await market.whitelistedERC20(user1.address);
      const isWhitelisted3 = await market.whitelistedERC20(user2.address);

      expect(isWhitelisted1).false;
      expect(isWhitelisted2).false;
      expect(isWhitelisted3).false;
    });

    it('should succeed with one entry', async () => {
      const erc20 = (await Erc20.connect(userWithTokens).deploy()) as MockERC20;
      const market = (await Market.connect(deployer).deploy([
        erc20.address
      ])) as NFTMarketSimple;

      const isWhitelisted = await market.whitelistedERC20(erc20.address);
      expect(isWhitelisted).true;
    });

    it('should succeed with multiple entries', async () => {
      const erc20 = (await Erc20.connect(userWithTokens).deploy()) as MockERC20;
      const market = (await Market.connect(deployer).deploy([
        erc20.address,
        user1.address, // not really ERC20, but makes no difference here
        user2.address
      ])) as NFTMarketSimple;

      const isWhitelisted1 = await market.whitelistedERC20(erc20.address);
      const isWhitelisted2 = await market.whitelistedERC20(erc20.address);
      const isWhitelisted3 = await market.whitelistedERC20(erc20.address);

      expect(isWhitelisted1).true;
      expect(isWhitelisted2).true;
      expect(isWhitelisted3).true;
    });
  });

  describe('via functions', async () => {
    let market: NFTMarketSimple;
    beforeEach(async function () {
      const accounts = await ethers.getSigners();
      deployer = accounts[0];
      user1 = accounts[1];
      user2 = accounts[2];
      userWithTokens = accounts[3];

      Market = await ethers.getContractFactory('NFTMarketAuction');
      Erc20 = await ethers.getContractFactory('MockERC20');

      erc20 = (await Erc20.connect(userWithTokens).deploy()) as MockERC20;
      market = (await Market.connect(deployer).deploy([
        erc20.address
      ])) as NFTMarketSimple;
    });

    it('can add', async () => {
      await market.connect(deployer).addToWhitelist(user1.address);

      const isWhitelisted = await market.whitelistedERC20(user1.address);
      expect(isWhitelisted).true;
    });

    it('can remove added', async () => {
      await market.connect(deployer).addToWhitelist(user1.address);
      await market.connect(deployer).removeFromWhitelist(user1.address);

      const isWhitelisted = await market.whitelistedERC20(user1.address);
      expect(isWhitelisted).false;
    });

    it('can remove original', async () => {
      await market.connect(deployer).removeFromWhitelist(erc20.address);

      const isWhitelisted = await market.whitelistedERC20(erc20.address);
      expect(isWhitelisted).false;
    });

    it('can readd', async () => {
      await market.connect(deployer).removeFromWhitelist(erc20.address);
      await market.connect(deployer).addToWhitelist(erc20.address);

      const isWhitelisted = await market.whitelistedERC20(erc20.address);
      expect(isWhitelisted).true;
    });

    it('adding fails for non-owner', async () => {
      await expect(
        market.connect(user1).addToWhitelist(user1.address)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('removal fails for non-owner', async () => {
      await expect(
        market.connect(user1).removeFromWhitelist(erc20.address)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });
});
