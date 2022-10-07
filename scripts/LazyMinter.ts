// Adjusted from https://github.com/BestItPartner/nft_lazy_minting/blob/main/lib/LazyMinter.js

import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

// These constants must match the ones used in the smart contract.
const SIGNING_DOMAIN_NAME = 'HowToPulse-Voucher';
const SIGNING_DOMAIN_VERSION = '1';

/**
 * JSDoc typedefs.
 *
 * @typedef {object} NFTVoucher
 * @property {ethers.BigNumber | number} tokenId the id of the un-minted NFT
 * @property {ethers.BigNumber | number} minPrice the minimum price (in wei) that the creator will accept to redeem this NFT
 * @property {ethers.BigNumber | number} royalty possible royalty for NFT sales
 * @property {string} creator address of the NFT creator
 * @property {string} uri the metadata URI to associate with this NFT
 * @property {ethers.BytesLike} signature an EIP-712 signature of all fields in the NFTVoucher, apart from signature itself.
 */

/**
 * LazyMinter is a helper class that creates NFTVoucher objects and signs them, to be redeemed later by the LazyNFT contract.
 */
class LazyMinter {
  contractAddress: string;
  chainId: number;
  signer: SignerWithAddress;
  _domain: any;

  /**
   * Create a new LazyMinter targeting a deployed instance of the LazyNFT contract.
   *
   * @param {Object} options
   * @param {ethers.Contract} contract an ethers Contract that's wired up to the deployed contract
   * @param {number} chainId the used chainId
   * @param {ethers.Signer} signer a Signer whose account is authorized to mint NFTs on the deployed contract
   */
  constructor({
    contractAddress,
    chainId,
    signer
  }: {
    contractAddress: string;
    chainId: number;
    signer: SignerWithAddress;
  }) {
    this.contractAddress = contractAddress;
    this.chainId = chainId;
    this.signer = signer;
  }

  /**
   * Creates a new NFTVoucher object and signs it using this LazyMinter's signing key.
   *
   * @param {ethers.BigNumber | number} tokenId the id of the un-minted NFT
   * @param {string} uri the metadata URI to associate with this NFT
   * @param {string} creator the metadata URI to associate with this NFT
   * @param {ethers.BigNumber | number} minPrice the minimum price (in wei) that the creator will accept to redeem this NFT. defaults to zero
   * @param {ethers.BigNumber | number} royalty the metadata URI to associate with this NFT
   *
   * @returns {NFTVoucher}
   */
  async createVoucher(tokenId, uri, minPrice = 0, royalty = 0) {
    const voucher = {
      tokenId: tokenId,
      minPrice: minPrice,
      royalty: royalty,
      creator: this.signer.address,
      uri: uri
    };

    const domain = await this._signingDomain();
    const types = {
      NFTVoucher: [
        { name: 'tokenId', type: 'uint256' },
        { name: 'minPrice', type: 'uint256' },
        { name: 'royalty', type: 'uint96' },
        { name: 'creator', type: 'address' },
        { name: 'uri', type: 'string' }
      ]
    };
    //    console.log('aa');
    const signature = await this.signer._signTypedData(domain, types, voucher);
    //console.log('signing with', this.signer.address);
    return {
      ...voucher,
      signature
    };
  }

  /**
   * @private
   * @returns {object} the EIP-721 signing domain, tied to the specified chainId
   */
  async _signingDomain() {
    if (this._domain != null) {
      return this._domain;
    }
    const chainId = this.chainId;
    this._domain = {
      name: SIGNING_DOMAIN_NAME,
      version: SIGNING_DOMAIN_VERSION,
      verifyingContract: this.contractAddress,
      chainId
    };
    return this._domain;
  }
}

export default LazyMinter;
