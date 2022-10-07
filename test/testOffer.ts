import '@nomiclabs/hardhat-waffle';

import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';
import { assert, expect } from 'chai';
import { deployMockContract } from 'ethereum-waffle';
import { ethers, network, waffle } from 'hardhat';

import {
  MockERC20,
  NFT721,
  NFT1155,
  NFT1155__factory,
  NFTMarketOffers
} from '../typechain/pulse';

const dummyDeadline = 9000000000;

describe('Offer', async () => {
  let offers: NFTMarketOffers,
    nft721: NFT721,
    nft1155: NFT1155,
    erc20: MockERC20,
    anotherErc20: MockERC20;
  let deployer: SignerWithAddress,
    user2: SignerWithAddress,
    userWithNFT: SignerWithAddress,
    userWithTokens: SignerWithAddress,
    user2WithTokens: SignerWithAddress;

  beforeEach(async function () {
    const accounts = await ethers.getSigners();
    deployer = accounts[0];
    user2 = accounts[1];
    userWithNFT = accounts[2];
    userWithTokens = accounts[3];
    user2WithTokens = accounts[4];

    const Offers = await ethers.getContractFactory('NFTMarketOffers');
    const Erc20 = await ethers.getContractFactory('MockERC20');

    erc20 = (await Erc20.connect(userWithTokens).deploy()) as MockERC20;
    anotherErc20 = (await Erc20.connect(userWithTokens).deploy()) as MockERC20;
    offers = (await Offers.connect(deployer).deploy([
      erc20.address
    ])) as NFTMarketOffers;

    await erc20.connect(userWithTokens).freeMint(10000);
    await erc20.connect(userWithTokens).approve(offers.address, 6000);

    await erc20.connect(user2WithTokens).freeMint(10000);
    await erc20.connect(user2WithTokens).approve(offers.address, 6000);
  });

  describe('Creating an offer', async () => {
    beforeEach(async function () {
      const NFT721 = await ethers.getContractFactory('NFT721');
      nft721 = (await NFT721.connect(deployer).deploy()) as NFT721;
      await nft721.connect(userWithNFT).createToken('dummy', 0);
      await nft721.connect(userWithNFT).setApprovalForAll(offers.address, true);

      const NFT1155 = await ethers.getContractFactory('NFT1155');
      nft1155 = (await NFT1155.connect(deployer).deploy()) as NFT1155;
      await nft1155.connect(userWithNFT).createToken('dummy', 5, 0);
      await nft1155
        .connect(userWithNFT)
        .setApprovalForAll(offers.address, true);
    });

    it('should create a correct offer item for ERC-721', async () => {
      await offers
        .connect(userWithTokens)
        .offerOnNft(nft721.address, 1, 1, erc20.address, 5, dummyDeadline);

      const offer = await offers.offers(1);

      expect(offer.offerer).to.equal(userWithTokens.address);
      expect(offer.nftContract).to.equal(nft721.address);
      expect(offer.tokenId).to.equal(1);
      expect(offer.quantity).to.equal(1);
      expect(offer.erc20Address).to.equal(erc20.address);
      expect(offer.singleOfferPrice).to.equal(5);
      expect(offer.deadline).to.equal(dummyDeadline);
    });

    it('should create a correct offer item for ERC-1155', async () => {
      await offers
        .connect(userWithTokens)
        .offerOnNft(nft1155.address, 1, 4, erc20.address, 5, dummyDeadline);

      const offer = await offers.offers(1);

      expect(offer.offerer).to.equal(userWithTokens.address);
      expect(offer.nftContract).to.equal(nft1155.address);
      expect(offer.tokenId).to.equal(1);
      expect(offer.quantity).to.equal(4);
      expect(offer.erc20Address).to.equal(erc20.address);
      expect(offer.singleOfferPrice).to.equal(5);
      expect(offer.deadline).to.equal(dummyDeadline);
    });

    it('should emit the correct events', async () => {
      await expect(
        offers
          .connect(userWithTokens)
          .offerOnNft(nft721.address, 1, 1, erc20.address, 5, dummyDeadline)
      )
        .to.emit(offers, 'OfferCreated')
        .withArgs(1);
    });

    it('should fail if paused', async () => {
      await offers.connect(deployer).pause();
      await expect(
        offers
          .connect(userWithTokens)
          .offerOnNft(nft721.address, 1, 1, erc20.address, 5, dummyDeadline)
      ).to.be.revertedWith('Pausable: paused');
    });

    it('should fail if not enough allowance', async () => {
      await expect(
        offers
          .connect(userWithTokens)
          .offerOnNft(nft721.address, 1, 1, erc20.address, 7000, dummyDeadline)
      ).to.be.revertedWith('Not enough allowance');
    });

    describe('Invalid parameters', async () => {
      it('should fail if incorrect price token', async () => {
        await expect(
          offers
            .connect(userWithTokens)
            .offerOnNft(
              nft721.address,
              1,
              1,
              anotherErc20.address,
              500,
              dummyDeadline
            )
        ).to.be.revertedWith('Invalid price token');
      });

      it('should fail if the deadline is incorrect', async () => {
        await expect(
          offers
            .connect(userWithTokens)
            .offerOnNft(nft721.address, 1, 1, erc20.address, 5, 1)
        ).to.be.revertedWith('Deadline must be in the future');
      });

      it('should fail if the amount is zero', async () => {
        await expect(
          offers
            .connect(userWithTokens)
            .offerOnNft(nft721.address, 1, 1, erc20.address, 0, dummyDeadline)
        ).to.be.revertedWith('Must offer something');
      });

      it('should fail if the quantity is zero', async () => {
        await expect(
          offers
            .connect(userWithTokens)
            .offerOnNft(nft721.address, 1, 0, erc20.address, 5, dummyDeadline)
        ).to.be.revertedWith('Must offer on some amount of NFTs');
      });

      it('should fail if quantity above one for ERC-721', async () => {
        await expect(
          offers
            .connect(userWithTokens)
            .offerOnNft(nft721.address, 1, 2, erc20.address, 5, dummyDeadline)
        ).to.be.revertedWith('ERC-721 can have only quantity of 1');
      });

      it('should fail if invalid NFT address', async () => {
        await expect(
          offers
            .connect(userWithTokens)
            .offerOnNft(user2.address, 1, 1, erc20.address, 500, dummyDeadline)
        ).to.be.revertedWith('Not supported');
      });

      it('should fail if not a supported NFT Type', async () => {
        const mockContract = await deployMockContract(
          userWithNFT,
          NFT1155__factory.abi
        );
        await mockContract.mock.supportsInterface.returns(false);

        await expect(
          offers
            .connect(userWithTokens)
            .offerOnNft(
              mockContract.address,
              1,
              1,
              erc20.address,
              5,
              dummyDeadline
            )
        ).to.be.revertedWith('Not supported');
      });
    });
  });

  describe('Accepting a 721 offer', async () => {
    beforeEach(async function () {
      const NFT721 = await ethers.getContractFactory('NFT721');
      nft721 = (await NFT721.connect(deployer).deploy()) as NFT721;
      await nft721.connect(userWithNFT).createToken('dummy', 0);
      await nft721.connect(userWithNFT).setApprovalForAll(offers.address, true);

      const deadline = await getTimestamp();

      await offers
        .connect(userWithTokens)
        .offerOnNft(nft721.address, 1, 1, erc20.address, 505, deadline + 5000);
    });

    it('should work', async () => {
      await offers.connect(userWithNFT).acceptOffer(1, 1);
    });

    it('should transfer ERC20 asset', async () => {
      const marketERC20AllowanceBefore = await erc20.allowance(
        userWithTokens.address,
        offers.address
      );

      const tx = offers.connect(userWithNFT).acceptOffer(1, 1);

      await expect(() => tx).to.changeTokenBalances(
        erc20,
        [userWithTokens, userWithNFT, deployer],
        [-505, 500, 5]
      );

      const marketERC20AllowanceAfter = await erc20.allowance(
        userWithTokens.address,
        offers.address
      );

      expect(
        marketERC20AllowanceAfter.sub(marketERC20AllowanceBefore)
      ).to.equal(-505);
    });

    it('should transfer NFT asset', async () => {
      const ownerBefore = await nft721.ownerOf(1);
      await offers.connect(userWithNFT).acceptOffer(1, 1);
      const ownerAfter = await nft721.ownerOf(1);

      expect(ownerBefore).to.equal(userWithNFT.address);
      expect(ownerAfter).to.equal(userWithTokens.address);
    });

    it('should emit the correct events', async () => {
      await expect(offers.connect(userWithNFT).acceptOffer(1, 1))
        .to.emit(offers, 'OfferAccepted')
        .withArgs(1, 1);
    });

    it('should fail if paused', async () => {
      await offers.connect(deployer).pause();
      await expect(
        offers.connect(userWithNFT).acceptOffer(1, 1)
      ).to.be.revertedWith('Pausable: paused');
    });

    it('should fail if no such offer', async () => {
      await expect(
        offers.connect(userWithNFT).acceptOffer(2, 1)
      ).to.be.revertedWith('No offer found');
    });

    it('should fail if not enough erc20 approval', async () => {
      // remove approval
      await erc20.connect(userWithTokens).approve(offers.address, 4);
      await expect(
        offers.connect(userWithNFT).acceptOffer(1, 1)
      ).to.be.revertedWith('Not enough allowance');
    });

    it('should fail if no NFT approval', async () => {
      // remove approval
      await nft721
        .connect(userWithNFT)
        .setApprovalForAll(offers.address, false);
      await expect(
        offers.connect(userWithNFT).acceptOffer(1, 1)
      ).to.be.revertedWith('ERC721: caller is not token owner nor approved');
    });

    it('should fail if deadline has passed', async () => {
      await nextDay();
      await expect(
        offers.connect(userWithTokens).acceptOffer(1, 1)
      ).to.be.revertedWith('The offer has expired');
    });

    it('should fail if accepting zero', async () => {
      await expect(
        offers.connect(userWithTokens).acceptOffer(1, 0)
      ).to.be.revertedWith('Should accept something');
    });

    it('should fail if not owner', async () => {
      await expect(
        offers.connect(userWithTokens).acceptOffer(1, 1)
      ).to.be.revertedWith('Only owner can accept offer');
    });
  });

  describe('Accepting a 1155 offer', async () => {
    beforeEach(async function () {
      const NFT1155 = await ethers.getContractFactory('NFT1155');
      nft1155 = (await NFT1155.connect(deployer).deploy()) as NFT1155;
      await nft1155.connect(userWithNFT).createToken('dummy', 5, 0);
      await nft1155
        .connect(userWithNFT)
        .setApprovalForAll(offers.address, true);

      await offers
        .connect(userWithTokens)
        .offerOnNft(nft1155.address, 1, 1, erc20.address, 300, dummyDeadline);

      await offers
        .connect(user2WithTokens)
        .offerOnNft(nft1155.address, 1, 4, erc20.address, 100, dummyDeadline);
    });

    it('should work for single NFT', async () => {
      await offers.connect(userWithNFT).acceptOffer(1, 1);
    });

    it('should work for multiple NFTs with full acceptance', async () => {
      await offers.connect(userWithNFT).acceptOffer(2, 4);
    });

    it('should work for multiple NFTs with partial acceptance', async () => {
      await offers.connect(userWithNFT).acceptOffer(2, 1);

      await offers.connect(userWithNFT).acceptOffer(2, 3);
    });

    it('partial acceptance should leave rest of the offer available', async () => {
      await offers.connect(userWithNFT).acceptOffer(2, 1);

      const offer = await offers.offers(2);

      expect(offer.offerer).to.equal(user2WithTokens.address);
      expect(offer.nftContract).to.equal(nft1155.address);
      expect(offer.tokenId).to.equal(1);
      expect(offer.quantity).to.equal(3);
      expect(offer.erc20Address).to.equal(erc20.address);
      expect(offer.singleOfferPrice).to.equal(100);
      expect(offer.deadline).to.equal(dummyDeadline);
    });

    it('should transfer ERC20 asset for single NFT', async () => {
      const marketERC20AllowanceBefore = await erc20.allowance(
        userWithTokens.address,
        offers.address
      );

      const tx = offers.connect(userWithNFT).acceptOffer(1, 1);

      await expect(() => tx).to.changeTokenBalances(
        erc20,
        [userWithTokens, userWithNFT, deployer],
        [-300, 297, 3]
      );

      const marketERC20AllowanceAfter = await erc20.allowance(
        userWithTokens.address,
        offers.address
      );

      expect(
        marketERC20AllowanceAfter.sub(marketERC20AllowanceBefore)
      ).to.equal(-300);
    });

    it('should transfer ERC20 asset for multiple NFTs', async () => {
      const marketERC20AllowanceBefore = await erc20.allowance(
        user2WithTokens.address,
        offers.address
      );

      const tx = offers.connect(userWithNFT).acceptOffer(2, 4);

      await expect(() => tx).to.changeTokenBalances(
        erc20,
        [user2WithTokens, userWithNFT, deployer],
        [-400, 396, 4]
      );

      const marketERC20AllowanceAfter = await erc20.allowance(
        user2WithTokens.address,
        offers.address
      );

      expect(
        marketERC20AllowanceAfter.sub(marketERC20AllowanceBefore)
      ).to.equal(-400);
    });

    it('should transfer ERC20 asset for partial acceptance', async () => {
      const marketERC20AllowanceBefore = await erc20.allowance(
        user2WithTokens.address,
        offers.address
      );

      const tx = offers.connect(userWithNFT).acceptOffer(2, 3);

      await expect(() => tx).to.changeTokenBalances(
        erc20,
        [user2WithTokens, userWithNFT, deployer],
        [-300, 297, 3]
      );

      const marketERC20AllowanceAfter = await erc20.allowance(
        user2WithTokens.address,
        offers.address
      );

      expect(
        marketERC20AllowanceAfter.sub(marketERC20AllowanceBefore)
      ).to.equal(-300);
    });

    it('should transfer ERC20 asset for partial acceptance, for subsequent offer', async () => {
      await offers.connect(userWithNFT).acceptOffer(2, 1);

      const marketERC20AllowanceBefore = await erc20.allowance(
        user2WithTokens.address,
        offers.address
      );

      const tx = offers.connect(userWithNFT).acceptOffer(2, 3);

      await expect(() => tx).to.changeTokenBalances(
        erc20,
        [user2WithTokens, userWithNFT, deployer],
        [-300, 297, 3]
      );

      const marketERC20AllowanceAfter = await erc20.allowance(
        user2WithTokens.address,
        offers.address
      );

      expect(
        marketERC20AllowanceAfter.sub(marketERC20AllowanceBefore)
      ).to.equal(-300);
    });

    it('should transfer ERC20 asset for partial acceptance, for subsequent offer with new owner', async () => {
      await offers.connect(userWithNFT).acceptOffer(2, 2);

      // Transfer some of the tokens away so we have a new owner
      await nft1155
        .connect(user2WithTokens)
        .safeTransferFrom(user2WithTokens.address, user2.address, 1, 1, []);

      await nft1155.connect(user2).setApprovalForAll(offers.address, true);

      await expect(() =>
        offers.connect(user2).acceptOffer(2, 1)
      ).to.changeTokenBalances(
        erc20,
        [user2, userWithNFT, deployer, user2WithTokens],
        [99, 0, 1, -100]
      );
    });

    it('should transfer NFT asset for single NFT', async () => {
      const sellerBalanceBefore = await nft1155.balanceOf(
        userWithNFT.address,
        1
      );
      const buyerBalanceBefore = await nft1155.balanceOf(
        userWithTokens.address,
        1
      );

      await offers.connect(userWithNFT).acceptOffer(1, 1);
      const sellerBalanceAfter = await nft1155.balanceOf(
        userWithNFT.address,
        1
      );
      const buyerBalanceAfter = await nft1155.balanceOf(
        userWithTokens.address,
        1
      );

      expect(sellerBalanceAfter.sub(sellerBalanceBefore)).to.equal(-1);
      expect(buyerBalanceAfter.sub(buyerBalanceBefore)).to.equal(1);
    });

    it('should transfer NFT asset for multiple NFTs', async () => {
      const sellerBalanceBefore = await nft1155.balanceOf(
        userWithNFT.address,
        1
      );
      const buyerBalanceBefore = await nft1155.balanceOf(
        user2WithTokens.address,
        1
      );

      await offers.connect(userWithNFT).acceptOffer(2, 3);
      const sellerBalanceAfter = await nft1155.balanceOf(
        userWithNFT.address,
        1
      );
      const buyerBalanceAfter = await nft1155.balanceOf(
        user2WithTokens.address,
        1
      );

      expect(sellerBalanceAfter.sub(sellerBalanceBefore)).to.equal(-3);
      expect(buyerBalanceAfter.sub(buyerBalanceBefore)).to.equal(3);
    });

    it('should transfer NFT asset for subsequent partial offer acceptance', async () => {
      await offers.connect(userWithNFT).acceptOffer(2, 3);

      const sellerBalanceBefore = await nft1155.balanceOf(
        userWithNFT.address,
        1
      );
      const buyerBalanceBefore = await nft1155.balanceOf(
        user2WithTokens.address,
        1
      );

      await offers.connect(userWithNFT).acceptOffer(2, 1);

      const sellerBalanceAfter = await nft1155.balanceOf(
        userWithNFT.address,
        1
      );
      const buyerBalanceAfter = await nft1155.balanceOf(
        user2WithTokens.address,
        1
      );

      expect(sellerBalanceAfter.sub(sellerBalanceBefore)).to.equal(-1);
      expect(buyerBalanceAfter.sub(buyerBalanceBefore)).to.equal(1);
    });

    it('should fail if no such offer', async () => {
      await expect(
        offers.connect(userWithNFT).acceptOffer(5, 1)
      ).to.be.revertedWith('No offer found');
    });

    it('should fail if not enough erc20 approval', async () => {
      // remove approval
      await erc20.connect(userWithTokens).approve(offers.address, 4);
      await expect(
        offers.connect(userWithNFT).acceptOffer(1, 1)
      ).to.be.revertedWith('Not enough allowance');
    });

    it('should fail if no NFT approval', async () => {
      // remove approval
      await nft1155
        .connect(userWithNFT)
        .setApprovalForAll(offers.address, false);
      await expect(
        offers.connect(userWithNFT).acceptOffer(1, 1)
      ).to.be.revertedWith('ERC1155: caller is not token owner nor approved');
    });

    it('should fail if not enough balance for an offer of one NFT', async () => {
      await expect(
        offers.connect(userWithTokens).acceptOffer(1, 1)
      ).to.be.revertedWith('Not enough balance');
    });

    it('should fail if not enough balance for an offer of multiple NFTs', async () => {
      // Transfer enough NFTs out that the owner no longer has enough NFTs to sell
      await nft1155
        .connect(userWithNFT)
        .safeTransferFrom(userWithNFT.address, user2.address, 1, 2, []);

      await expect(
        offers.connect(userWithNFT).acceptOffer(2, 4)
      ).to.be.revertedWith('Not enough balance');
    });

    it('should fail if offer has been exhausted', async () => {
      await offers.connect(userWithNFT).acceptOffer(1, 1);

      await expect(
        offers.connect(userWithNFT).acceptOffer(1, 1)
      ).to.be.revertedWith('Offer quantity exhausted');
    });
  });

  describe('Cancelling an offer', async () => {
    beforeEach(async function () {
      const NFT721 = await ethers.getContractFactory('NFT721');
      nft721 = (await NFT721.connect(deployer).deploy()) as NFT721;
      await nft721.connect(userWithNFT).createToken('dummy', 0);
      await nft721.connect(userWithNFT).setApprovalForAll(offers.address, true);

      const deadline = await getTimestamp();

      await offers
        .connect(userWithTokens)
        .offerOnNft(nft721.address, 1, 1, erc20.address, 505, deadline + 5000);
    });

    it('should work', async () => {
      await offers.connect(userWithTokens).cancelOffer(1);
    });

    it('should emit the correct events', async () => {
      await expect(offers.connect(userWithTokens).cancelOffer(1))
        .to.emit(offers, 'OfferCancelled')
        .withArgs(1);
    });

    it('prevents acceptance', async () => {
      await offers.connect(userWithTokens).cancelOffer(1);
      await expect(
        offers.connect(userWithNFT).acceptOffer(1, 1)
      ).to.be.revertedWith('Offer quantity exhausted');
    });

    it('fails if no such offer', async () => {
      await expect(
        offers.connect(userWithTokens).cancelOffer(10)
      ).to.be.revertedWith('No offer found');
    });

    it('fails if not your offer', async () => {
      await expect(
        offers.connect(userWithNFT).cancelOffer(1)
      ).to.be.revertedWith('Only offerer can cancel');
    });

    it("fails if trying to cancel when there's nothing to cancel", async () => {
      offers.connect(userWithNFT).acceptOffer(1, 1);
      await expect(
        offers.connect(userWithTokens).cancelOffer(1)
      ).to.be.revertedWith('Nothing to cancel');
    });
  });

  describe('Handling royalties', async () => {
    beforeEach(async function () {
      const NFT721 = await ethers.getContractFactory('NFT721');
      nft721 = (await NFT721.connect(deployer).deploy()) as NFT721;
      await nft721.connect(userWithNFT).createToken('dummy', 765);
      await nft721.connect(userWithNFT).setApprovalForAll(offers.address, true);

      const NFT1155 = await ethers.getContractFactory('NFT1155');
      nft1155 = (await NFT1155.connect(deployer).deploy()) as NFT1155;
      await nft1155.connect(userWithNFT).createToken('dummy', 5, 876);
      await nft1155
        .connect(userWithNFT)
        .setApprovalForAll(offers.address, true);

      await erc20.connect(user2).freeMint(10000);
      await erc20.connect(user2).approve(offers.address, 10000);

      await offers
        .connect(userWithTokens)
        .offerOnNft(nft721.address, 1, 1, erc20.address, 505, dummyDeadline);
    });

    it('should work', async () => {
      await offers.connect(userWithNFT).acceptOffer(1, 1);
    });

    it('should transfer ERC20 asset and royalty in primary sale', async () => {
      await expect(() =>
        offers.connect(userWithNFT).acceptOffer(1, 1)
      ).to.changeTokenBalances(
        erc20,
        [userWithTokens, userWithNFT, deployer],
        [-505, 505 - 5, 5]
      );
    });

    it('should transfer ERC20 asset and royalty in secondary sale', async () => {
      await offers.connect(userWithNFT).acceptOffer(1, 1);

      await offers
        .connect(user2)
        .offerOnNft(nft721.address, 1, 1, erc20.address, 606, dummyDeadline);

      await nft721
        .connect(userWithTokens)
        .setApprovalForAll(offers.address, true);

      // 7,65% of 606 = 46
      await expect(() =>
        offers.connect(userWithTokens).acceptOffer(2, 1)
      ).to.changeTokenBalances(
        erc20,
        [userWithTokens, userWithNFT, user2, deployer],
        [606 - 46 - 6, 46, -606, 6]
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
