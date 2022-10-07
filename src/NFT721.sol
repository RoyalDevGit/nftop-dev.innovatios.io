// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

// erc 721
import '@openzeppelin/contracts/token/ERC721/ERC721.sol';
import '@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol';
import '@openzeppelin/contracts/token/common/ERC2981.sol';

// utils
import '@openzeppelin/contracts/utils/Counters.sol';
import '@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol';

// TODO: probably not needed?
import '@openzeppelin/contracts/access/Ownable.sol';

import 'hardhat/console.sol';

contract NFT721 is ERC721URIStorage, ERC2981, EIP712, Ownable {
  using Counters for Counters.Counter;
  Counters.Counter public _tokensIds; // for minting incrementing

  string private constant SIGNING_DOMAIN = 'HowToPulse-Voucher';
  string private constant SIGNATURE_VERSION = '1';

  event Mint(uint256 newItemId);

  /// @notice Represents an un-minted NFT, which has not yet been recorded into the blockchain. A signed voucher can be redeemed for a real NFT using the redeem function.
  struct NFTVoucher {
    /// @notice The id of the token to be redeemed. Must be unique - if another token with this ID already exists, the redeem function will revert.
    uint256 tokenId;
    /// @notice The minimum price (in wei) that the NFT creator is willing to accept for the initial sale of this NFT.
    uint256 minPrice;
    /// @notice Possible creator royalty for the NFT
    uint96 royalty;
    /// @notice NFT creator
    address creator;
    /// @notice The metadata URI to associate with this token.
    string uri;
    /// @notice the EIP-712 signature of all other fields in the NFTVoucher struct. For a voucher to be valid, it must be signed by an account with the MINTER_ROLE.
    bytes signature;
  }

  constructor()
    ERC721('HowToPulse', 'HTP')
    EIP712(SIGNING_DOMAIN, SIGNATURE_VERSION)
  {}

  /// @notice Redeems a lazy minted voucher for an actual NFT, creating it in the process.
  /// @param receiver The address of the account which will receive the NFT upon success.
  /// @param voucher A signed NFTVoucher that describes the NFT to be redeemed.
  function redeem(address receiver, NFTVoucher calldata voucher)
    public
    payable
  {
    // Make sure signature is valid and get the address of the signer
    // The returned signer is never 0x0
    address signer = _verify(voucher);

    // make sure that the signer is authorized to mint NFTs
    //require(hasRole(MINTER_ROLE, signer), "Signature invalid or unauthorized");

    require(signer == voucher.creator, 'Invalid signature or unauthorized');

    // make sure that the receiver is paying enough to cover the buyer's cost
    require(msg.value >= voucher.minPrice, 'Insufficient funds to redeem');

    // first assign the token to the signer, to establish provenance on-chain
    _mint(signer, voucher.tokenId);

    _setTokenURI(voucher.tokenId, voucher.uri);

    if (voucher.royalty > 0) {
      _setTokenRoyalty(voucher.tokenId, voucher.creator, voucher.royalty);
    }

    // transfer the token to the receiver
    _transfer(signer, receiver, voucher.tokenId);

    // transfer supplied value to the creator
    (bool success, ) = payable(voucher.creator).call{
      value: msg.value,
      gas: 3000
    }('');
    success; // to suppress unused variable warning

    emit Mint(voucher.tokenId);
  }

  /// @notice Returns a hash of the given NFTVoucher, prepared using EIP712 typed data hashing rules.
  /// @param voucher An NFTVoucher to hash.
  function _hash(NFTVoucher calldata voucher) internal view returns (bytes32) {
    return
      _hashTypedDataV4(
        keccak256(
          abi.encode(
            keccak256(
              'NFTVoucher(uint256 tokenId,uint256 minPrice,uint96 royalty,address creator,string uri)'
            ),
            voucher.tokenId,
            voucher.minPrice,
            voucher.royalty,
            voucher.creator,
            keccak256(bytes(voucher.uri))
          )
        )
      );
  }

  /// @notice Verifies the signature for a given NFTVoucher, returning the address of the signer.
  /// @dev Will revert if the signature is invalid. Does not verify that the signer is authorized to mint NFTs.
  /// @param voucher An NFTVoucher describing an unminted NFT.
  function _verify(NFTVoucher calldata voucher)
    internal
    view
    returns (address)
  {
    bytes32 digest = _hash(voucher);
    return ECDSA.recover(digest, voucher.signature);
  }

  /**
   * @dev Mints a token
   * @param tokenURI The metadata URL for this NFT
   * @param royalty Possible royalty percentage, specified in basis points (10000 means 100%)
   */
  function createToken(string memory tokenURI, uint96 royalty)
    public
    returns (uint256)
  {
    _tokensIds.increment();
    uint256 newItemId = _tokensIds.current();
    // minting
    _mint(msg.sender, newItemId);

    _setTokenURI(newItemId, tokenURI);

    if (royalty > 0) {
      _setTokenRoyalty(newItemId, msg.sender, royalty);
    }

    emit Mint(newItemId);

    return newItemId;
  }

  /// @inheritdoc ERC165
  function supportsInterface(bytes4 interfaceId)
    public
    view
    virtual
    override(ERC721, ERC2981)
    returns (bool)
  {
    return super.supportsInterface(interfaceId);
  }
}
