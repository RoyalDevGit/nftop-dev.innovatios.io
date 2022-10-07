import '@nomiclabs/hardhat-waffle';

import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';
import { assert, expect } from 'chai';
import { deployMockContract } from 'ethereum-waffle';
import { Contract } from 'ethers';
import { ethers, network, waffle } from 'hardhat';

import LazyMinter from '../scripts/LazyMinter';
import {
  IPartialNFT,
  MockERC20,
  NFT721,
  NFT1155,
  NFT1155__factory,
  NFTMarketOffers
} from '../typechain/pulse';

const dummyDeadline = 9000000000;

describe('Minting', async () => {
  let offers: NFTMarketOffers,
    nft721: NFT721,
    nft1155: NFT1155,
    erc20: MockERC20,
    anotherErc20: MockERC20;
  let deployer: SignerWithAddress,
    user2: SignerWithAddress,
    userWithNFT: SignerWithAddress,
    userWithTokens: SignerWithAddress,
    creator: SignerWithAddress;

  let chainId: number, lazyMinter: LazyMinter;

  beforeEach(async function () {
    const accounts = await ethers.getSigners();
    deployer = accounts[0];
    user2 = accounts[1];
    userWithNFT = accounts[2];
    userWithTokens = accounts[3];
    creator = accounts[4];
  });

  describe('sets correct royalty', async () => {
    // Creating an offer doesn't check what the NFT type is, so this is common for both types
    beforeEach(async function () {
      const NFT721 = await ethers.getContractFactory('NFT721');
      nft721 = (await NFT721.connect(deployer).deploy()) as NFT721;

      const NFT1155 = await ethers.getContractFactory('NFT1155');
      nft1155 = (await NFT1155.connect(deployer).deploy()) as NFT1155;
    });

    it('721 - empty royalty', async () => {
      await nft721.connect(userWithNFT).createToken('dummy', 0);

      const [receiver, royalty] = await nft721.royaltyInfo(1, 1000);
      expect(receiver).to.equal(ethers.constants.AddressZero);
      expect(royalty).to.equal(0);
    });

    it('721 - non-empty royalty', async () => {
      await nft721.connect(userWithNFT).createToken('dummy', 987);

      const [receiver, royalty] = await nft721.royaltyInfo(1, 1000);
      expect(receiver).to.equal(userWithNFT.address);
      expect(royalty).to.equal(98);
    });

    it('721 - royalty for further tokens', async () => {
      await nft721.connect(userWithNFT).createToken('dummy', 987);
      await nft721.connect(user2).createToken('dummy', 0);
      await nft721.connect(user2).createToken('dummy', 543);

      const [receiver1, royalty1] = await nft721.royaltyInfo(1, 1000);
      expect(receiver1).to.equal(userWithNFT.address);
      expect(royalty1).to.equal(98);

      const [receiver2, royalty2] = await nft721.royaltyInfo(2, 1000);
      expect(receiver2).to.equal(ethers.constants.AddressZero);
      expect(royalty2).to.equal(0);

      const [receiver3, royalty3] = await nft721.royaltyInfo(3, 1000);
      expect(receiver3).to.equal(user2.address);
      expect(royalty3).to.equal(54);
    });

    it('721 - fails with too big royalty', async () => {
      await expect(
        nft721.connect(userWithNFT).createToken('dummy', 10001)
      ).to.be.revertedWith('ERC2981: royalty fee will exceed salePrice');
    });

    it('1155 - empty royalty', async () => {
      await nft1155.connect(userWithNFT).createToken('dummy', 1, 0);

      const [receiver, royalty] = await nft1155.royaltyInfo(1, 1000);
      expect(receiver).to.equal(ethers.constants.AddressZero);
      expect(royalty).to.equal(0);
    });

    it('1155 - non-empty royalty', async () => {
      await nft1155.connect(userWithNFT).createToken('dummy', 1, 987);

      const [receiver, royalty] = await nft1155.royaltyInfo(1, 1000);
      expect(receiver).to.equal(userWithNFT.address);
      expect(royalty).to.equal(98);
    });

    it('1155 - non-empty royalty for multiple tokens', async () => {
      await nft1155.connect(userWithNFT).createToken('dummy', 5, 987);

      const [receiver, royalty] = await nft1155.royaltyInfo(1, 1000);
      expect(receiver).to.equal(userWithNFT.address);
      expect(royalty).to.equal(98);
    });

    it('1155 - royalty for further tokens', async () => {
      await nft1155.connect(userWithNFT).createToken('dummy', 1, 987);
      await nft1155.connect(user2).createToken('dummy', 1, 0);
      await nft1155.connect(user2).createToken('dummy', 1, 543);

      const [receiver1, royalty1] = await nft1155.royaltyInfo(1, 1000);
      expect(receiver1).to.equal(userWithNFT.address);
      expect(royalty1).to.equal(98);

      const [receiver2, royalty2] = await nft1155.royaltyInfo(2, 1000);
      expect(receiver2).to.equal(ethers.constants.AddressZero);
      expect(royalty2).to.equal(0);

      const [receiver3, royalty3] = await nft1155.royaltyInfo(3, 1000);
      expect(receiver3).to.equal(user2.address);
      expect(royalty3).to.equal(54);
    });
  });

  describe('lazy minting', async () => {
    beforeEach(async function () {
      const NFT721 = await ethers.getContractFactory('NFT721');
      nft721 = (await NFT721.connect(deployer).deploy()) as NFT721;

      const NFT1155 = await ethers.getContractFactory('NFT1155');
      nft1155 = (await NFT1155.connect(deployer).deploy()) as NFT1155;

      chainId = (await ethers.provider.getNetwork()).chainId;
      lazyMinter = new LazyMinter({
        contractAddress: nft721.address,
        chainId: chainId,
        signer: creator
      });
    });

    it('should create right voucher', async function () {
      const voucher = await lazyMinter.createVoucher(123, 'abc');

      expect(voucher.tokenId).to.equal(123);
      expect(voucher.minPrice).to.equal(0);
      expect(voucher.signature.length).to.gt(0);
      expect(voucher.uri).to.equal('abc');
    });

    it('emits the right events', async function () {
      const voucher = await lazyMinter.createVoucher(123, 'abc');

      await expect(nft721.connect(user2).redeem(user2.address, voucher))
        .to.emit(nft721, 'Transfer') // transfer from null address to minter
        .withArgs(
          ethers.constants.AddressZero,
          creator.address,
          voucher.tokenId
        )
        .and.to.emit(nft721, 'Transfer') // transfer from minter to redeemer
        .withArgs(creator.address, user2.address, voucher.tokenId);
    });

    it('should assign NFT', async function () {
      const voucher = await lazyMinter.createVoucher(123, 'abc');

      await nft721.connect(user2).redeem(user2.address, voucher);
      const owner = await nft721.ownerOf(123);
      const url = await nft721.tokenURI(123);

      expect(owner).to.equal(user2.address);
      expect(url).to.equal('abc');
    });

    it('should give NFT to anyone, transacted by anyone', async function () {
      // anyone with the right voucher can mint for anyone
      const voucher = await lazyMinter.createVoucher(123, 'abc');

      await nft721.connect(userWithNFT).redeem(userWithTokens.address, voucher);
      const owner = await nft721.ownerOf(123);
      const url = await nft721.tokenURI(123);

      expect(owner).to.equal(userWithTokens.address);
      expect(url).to.equal('abc');
    });

    it('fails for double use of voucher', async function () {
      const voucher = await lazyMinter.createVoucher(123, 'abc');
      await nft721.connect(user2).redeem(user2.address, voucher);

      await expect(
        nft721.connect(user2).redeem(user2.address, voucher)
      ).to.be.revertedWith('ERC721: token already minted');
    });

    it('fails for wrong chainId', async function () {
      const lazyMinter2 = new LazyMinter({
        contractAddress: nft721.address,
        chainId: 654,
        signer: deployer
      });
      const voucher = await lazyMinter2.createVoucher(123, 'abc');
      await expect(
        nft721.connect(user2).redeem(user2.address, voucher)
      ).to.be.revertedWith('Invalid signature or unauthorized');
    });

    it('fails for signature for wrong contract', async function () {
      const lazyMinter2 = new LazyMinter({
        contractAddress: nft1155.address,
        chainId: chainId,
        signer: deployer
      });
      const voucher = await lazyMinter2.createVoucher(123, 'abc');
      await expect(
        nft721.connect(user2).redeem(user2.address, voucher)
      ).to.be.revertedWith('Invalid signature or unauthorized');
    });

    describe('with minimum price', async () => {
      it('works when given minimum price', async function () {
        const voucher = await lazyMinter.createVoucher(123, 'abc', 5);

        await nft721
          .connect(user2)
          .redeem(user2.address, voucher, { value: 5 });
        const owner = await nft721.ownerOf(123);
        const url = await nft721.tokenURI(123);

        expect(owner).to.equal(user2.address);
        expect(url).to.equal('abc');
      });

      it('works when given too much value', async function () {
        const voucher = await lazyMinter.createVoucher(123, 'abc', 5);

        await nft721
          .connect(user2)
          .redeem(user2.address, voucher, { value: 6 });

        const owner = await nft721.ownerOf(123);
        const url = await nft721.tokenURI(123);

        expect(owner).to.equal(user2.address);
        expect(url).to.equal('abc');
      });

      it('transfers value correctly when exact value', async function () {
        const voucher = await lazyMinter.createVoucher(123, 'abc', 5);

        await expect(() =>
          nft721.connect(user2).redeem(user2.address, voucher, { value: 5 })
        ).to.changeEtherBalances([nft721, user2, creator], [0, -5, 5]);
      });

      it('transfers value correctly when higher value', async function () {
        const voucher = await lazyMinter.createVoucher(123, 'abc', 5);

        await expect(() =>
          nft721.connect(user2).redeem(user2.address, voucher, { value: 15 })
        ).to.changeEtherBalances([nft721, user2, creator], [0, -15, 15]);
      });

      it('fails for no supplied value', async function () {
        const voucher = await lazyMinter.createVoucher(123, 'abc', 5);

        await expect(
          nft721.connect(user2).redeem(user2.address, voucher)
        ).to.be.revertedWith('Insufficient funds to redeem');
      });

      it('fails for too low price', async function () {
        const voucher = await lazyMinter.createVoucher(123, 'abc', 5);

        await expect(
          nft721.connect(user2).redeem(user2.address, voucher, { value: 4 })
        ).to.be.revertedWith('Insufficient funds to redeem');
      });
    });

    describe('with royalty', async () => {
      it('sets correct royalty', async function () {
        const voucher = await lazyMinter.createVoucher(123, 'abc', 100, 500);

        await nft721
          .connect(user2)
          .redeem(user2.address, voucher, { value: 100 });

        const [receiver, royalty] = await nft721.royaltyInfo(123, 1000);
        expect(receiver).to.equal(creator.address);
        expect(royalty).to.equal(50);
      });

      it('works when given royalty', async function () {
        const voucher = await lazyMinter.createVoucher(123, 'abc', 100, 500);

        await nft721
          .connect(user2)
          .redeem(user2.address, voucher, { value: 100 });
        const owner = await nft721.ownerOf(123);
        const url = await nft721.tokenURI(123);

        expect(owner).to.equal(user2.address);
        expect(url).to.equal('abc');
      });

      it('transfers value correctly', async function () {
        const voucher = await lazyMinter.createVoucher(123, 'abc', 100, 500);

        await expect(() =>
          nft721.connect(user2).redeem(user2.address, voucher, { value: 100 })
        ).to.changeEtherBalances([nft721, user2, creator], [0, -100, 100]);
      });
    });
  });
});
