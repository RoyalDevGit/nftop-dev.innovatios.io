import { BigNumber, Contract } from 'ethers';
import * as fs from 'fs';
import { artifacts, ethers, network } from 'hardhat';
import hre from 'hardhat';

import {
  MockERC20,
  NFT721,
  NFT1155,
  NFTMarketAuction,
  NFTMarketOffers,
  NFTMarketSimple
} from '../typechain/pulse';

const addressFile = 'contract_addresses.md';

const verify = async (addr: string, args: any[]) => {
  try {
    await hre.run('verify:verify', {
      address: addr,
      constructorArguments: args
    });
  } catch (ex: any) {
    if (ex.toString().indexOf('Already Verified') == -1) {
      throw ex;
    }
  }
};

async function main() {
  console.log('Starting deployments');
  const accounts = await hre.ethers.getSigners();

  const deployer = accounts[0];

  const NFT721Fact = await ethers.getContractFactory('NFT721');
  const NFT1155Fact = await ethers.getContractFactory('NFT1155');
  const MockErc20Fact = await ethers.getContractFactory('MockERC20');
  const MarketSimpleFact = await ethers.getContractFactory('NFTMarketSimple');
  const MarketAuctionFact = await ethers.getContractFactory('NFTMarketAuction');
  const MarketOffersFact = await ethers.getContractFactory('NFTMarketOffers');

  const mockErc20 = (await MockErc20Fact.connect(
    deployer
  ).deploy()) as MockERC20;
  await mockErc20.deployed();

  const marketOffers = (await MarketOffersFact.connect(deployer).deploy([
    mockErc20.address
  ])) as NFTMarketOffers;
  await marketOffers.deployed();

  const marketSimple = (await MarketSimpleFact.connect(
    deployer
  ).deploy()) as NFTMarketSimple;
  await marketSimple.deployed();

  const marketAuction = (await MarketAuctionFact.connect(deployer).deploy([
    mockErc20.address
  ])) as NFTMarketAuction;
  await marketAuction.deployed();

  const nft721 = (await NFT721Fact.connect(deployer).deploy()) as NFT721;
  await nft721.deployed();

  const nft1155 = (await NFT1155Fact.connect(deployer).deploy()) as NFT1155;
  await nft1155.deployed();

  const writeAddr = (addr: string, name: string) => {
    fs.appendFileSync(
      addressFile,
      `${name}: [https://goerli.etherscan.io/address/${addr}](https://goerli.etherscan.io/address/${addr})<br/>`
    );
  };

  if (fs.existsSync(addressFile)) {
    fs.rmSync(addressFile);
  }

  fs.appendFileSync(
    addressFile,
    'This file contains the latest test deployment addresses in the Goerli network<br/>'
  );
  writeAddr(mockErc20.address, 'ERC-20');
  writeAddr(marketOffers.address, 'Offers');
  writeAddr(marketSimple.address, 'Simple');
  writeAddr(marketAuction.address, 'Auction');
  writeAddr(nft721.address, 'ERC-721');
  writeAddr(nft1155.address, 'ERC-1155');

  console.log('Deployments done, waiting for etherscan verifications');
  // Wait for the contracts to be propagated inside Etherscan
  await new Promise((f) => setTimeout(f, 60000));

  await verify(mockErc20.address, []);
  await verify(marketOffers.address, [[mockErc20.address]]);
  await verify(marketSimple.address, []);
  await verify(marketAuction.address, [[mockErc20.address]]);
  await verify(nft721.address, []);
  await verify(nft1155.address, []);

  console.log('All done');
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
