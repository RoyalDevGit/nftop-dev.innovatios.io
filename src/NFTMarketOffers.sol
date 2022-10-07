// SPDX-License-Identifier: MIT
// Used as some other regular ERC20 token in unit tests
pragma solidity ^0.8.4;

import './MarketTools.sol';

import 'hardhat/console.sol';

/**
 * @title Marketplace contract for arbitrary offers for NFTs
 */
contract NFTMarketOffers is MarketTools {
  using Counters for Counters.Counter;
  using ERC165Checker for address;

  mapping(address => uint256) nftOffers;
  mapping(uint256 => Offer) public offers;
  Counters.Counter private _offerIds;

  struct Offer {
    address offerer;
    address nftContract;
    uint256 tokenId;
    uint256 quantity;
    address erc20Address;
    uint256 singleOfferPrice;
    uint256 deadline;
  }

  event OfferCreated(uint256 indexed offerId);
  event OfferAccepted(uint256 indexed offerId, uint256 acceptQuantity);
  event OfferCancelled(uint256 indexed offerId);

  /**
   * @dev Initializes the contract
   * @param erc20TokenAddresses List of ERC20 tokens to be whitelisted initially
   */
  constructor(address[] memory erc20TokenAddresses)
    MarketTools(erc20TokenAddresses)
  {}

  /**
   * @dev Makes an offer on an arbitrary NFT
   * @param nftContract Address of the NFT contract
   * @param tokenId Token ID of the NFT
   * @param quantity Number of NFTs to make an offer on (always 1 for ERC-721)
   * @param offerERC20Address Address of the ERC20 used for pricing
   * @param singleOfferPrice Offered price for buying a single NFT
   * @param offerDeadline Timestamp when the offer is no longer valid
   */
  function offerOnNft(
    address nftContract,
    uint256 tokenId,
    uint256 quantity,
    address offerERC20Address,
    uint256 singleOfferPrice,
    uint256 offerDeadline
  ) external whenNotPaused {
    require(whitelistedERC20[offerERC20Address], 'Invalid price token');
    uint256 givenAllowance = IERC20(offerERC20Address).allowance(
      msg.sender,
      address(this)
    );
    require(
      givenAllowance >= singleOfferPrice * quantity,
      'Not enough allowance'
    );
    require(singleOfferPrice > 0, 'Must offer something');
    require(offerDeadline > block.timestamp, 'Deadline must be in the future');
    require(quantity > 0, 'Must offer on some amount of NFTs');
    require(
      !is721Type(nftContract) || quantity == 1,
      'ERC-721 can have only quantity of 1'
    );

    _offerIds.increment();
    uint256 offerId = _offerIds.current();

    Offer memory offer = Offer(
      msg.sender,
      nftContract,
      tokenId,
      quantity,
      offerERC20Address,
      singleOfferPrice,
      offerDeadline
    );
    offers[offerId] = offer;

    emit OfferCreated(offerId);
  }

  /**
   * @dev Accepts a previously made offer fully or partially
   * @param offerId ID of the offer
   * @param acceptQuantity How many NFTs to sell
   */
  function acceptOffer(uint256 offerId, uint256 acceptQuantity)
    external
    whenNotPaused
  {
    Offer storage offer = offers[offerId];
    require(offer.offerer != address(0x0), 'No offer found');

    uint256 givenAllowance = IERC20(offer.erc20Address).allowance(
      offer.offerer,
      address(this)
    );
    require(
      givenAllowance >= offer.singleOfferPrice * acceptQuantity,
      'Not enough allowance'
    );
    require(block.timestamp < offer.deadline, 'The offer has expired');
    require(acceptQuantity > 0, 'Should accept something');
    require(offer.quantity >= acceptQuantity, 'Offer quantity exhausted');

    // Check that the seller has enough of the NFT
    if (is721Type(offer.nftContract)) {
      address nftOwner = IERC721(offer.nftContract).ownerOf(offer.tokenId);
      require(nftOwner == msg.sender, 'Only owner can accept offer');
    } else {
      uint256 senderBalance = IERC1155(offer.nftContract).balanceOf(
        msg.sender,
        offer.tokenId
      );
      require(senderBalance >= acceptQuantity, 'Not enough balance');
    }

    offer.quantity -= acceptQuantity;

    uint256 commission = getPriceAfterPercent(
      offer.singleOfferPrice,
      acceptQuantity,
      commissionPercent
    );

    // Transfers royalty
    uint256 royalty = handleErc20Royalty(
      offer.nftContract,
      offer.tokenId,
      offer.erc20Address,
      offer.offerer,
      acceptQuantity * offer.singleOfferPrice
    );

    // Transfers price
    IERC20(offer.erc20Address).transferFrom(
      offer.offerer,
      msg.sender,
      acceptQuantity * offer.singleOfferPrice - commission - royalty
    );

    // Transfers commission
    IERC20(offer.erc20Address).transferFrom(offer.offerer, owner(), commission);

    // transfer the nfts from owner to offerer
    transferNFT(
      offer.nftContract,
      msg.sender,
      offer.offerer,
      offer.tokenId,
      acceptQuantity
    );

    emit OfferAccepted(offerId, acceptQuantity);
  }

  /**
   * @dev Cancels a previously made offer
   * @param offerId ID of the offer
   */
  function cancelOffer(uint256 offerId) external whenNotPaused {
    Offer storage offer = offers[offerId];
    require(offer.offerer != address(0x0), 'No offer found');
    require(offer.offerer == msg.sender, 'Only offerer can cancel');
    require(offer.quantity > 0, 'Nothing to cancel');

    offer.quantity = 0;

    emit OfferCancelled(offerId);
  }
}
