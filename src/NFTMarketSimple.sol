// contracts/Market.sol
// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.4;

import '@openzeppelin/contracts/security/ReentrancyGuard.sol';
import './MarketTools.sol';

/**
 * @title Marketplace contract for simple sales
 */
contract NFTMarketSimple is ReentrancyGuard, MarketTools {
  using Counters for Counters.Counter;
  using ERC165Checker for address;

  // listingId -> item details
  mapping(uint256 => SimpleMarketItem) public simpleListingIdToMarketItem;

  struct SimpleMarketItem {
    address nftContract;
    uint256 nftTokenId;
    uint256 price;
    uint256 originalQuantity;
    uint256 remainingQuantity;
    address ownerAddress;
    uint256 deadline;
  }

  event SimpleItemCreated(uint256 indexed listingId);
  event SimpleItemSold(
    uint256 indexed listingId,
    uint256 quantity,
    address buyer
  );
  event SimpleItemCancelled(uint256 indexed listingId);

  /**
   * @dev Initializes the marketplace contract. Parent constructor requires an address list
   */
  constructor() MarketTools(new address[](0)) {}

  /**
   * @dev Places an item for sale on the marketplace
   * @param nftContract Address of the NFT contract
   * @param tokenId Token ID of the NFT
   * @param price Price, denominated in the native asset
   * @param quantity How many of the same NFTs to set for sale
   * @param deadline Timestamp when the sale ends
   */
  function createSimpleMarketItem(
    address nftContract,
    uint256 tokenId,
    uint256 price,
    uint256 quantity,
    uint256 deadline
  ) external nonReentrant whenNotPaused {
    require(price > 0, 'Price too low');
    require(quantity > 0, 'Quantity too low');
    require(deadline > block.timestamp, 'Deadline must be in the future');
    require(
      quantity == 1 || !is721Type(nftContract),
      'ERC721 token can only have one'
    );
    require(
      userListedTokens[msg.sender][nftContract][tokenId] == 0,
      'A listing already exists for the token'
    );
    require(
      getNFTOwnerAmount(nftContract, tokenId, msg.sender) > 0,
      'Not enough NFTs'
    );

    checkNFTAllowance(nftContract);

    _listingIds.increment();
    uint256 listingId = _listingIds.current();

    simpleListingIdToMarketItem[listingId] = SimpleMarketItem(
      nftContract,
      tokenId,
      price,
      quantity,
      quantity,
      msg.sender,
      deadline
    );

    userListedTokens[msg.sender][nftContract][tokenId] = quantity;

    emit SimpleItemCreated(listingId);
  }

  /**
   * @dev Sells a previously listed market item
   * @param listingId ID of the listing
   * @param quantity How many to buy
   */
  function buySimple(uint256 listingId, uint256 quantity)
    external
    payable
    nonReentrant
    whenNotPaused
  {
    require(listingId <= _listingIds.current(), "Listing doesn't exist");
    SimpleMarketItem storage marketItem = simpleListingIdToMarketItem[
      listingId
    ];

    require(quantity > 0, 'Have to buy something');
    require(
      quantity <= marketItem.remainingQuantity,
      'Not enough items for sale'
    );
    require(block.timestamp < marketItem.deadline, 'The sale has ended');
    require(
      getNFTOwnerAmount(
        marketItem.nftContract,
        marketItem.nftTokenId,
        marketItem.ownerAddress
      ) > 0,
      "Seller doesn't have the NFT"
    );
    require(msg.sender != marketItem.ownerAddress, "Can't buy your own");

    uint256 commission = getPriceAfterPercent(
      marketItem.price,
      quantity,
      commissionPercent
    );

    require(
      msg.value == (marketItem.price * quantity) + commission,
      'Incorrect value provided'
    );

    marketItem.remainingQuantity -= quantity;

    uint256 royalty = handleRoyalty(
      marketItem.nftContract,
      marketItem.nftTokenId,
      marketItem.price * quantity
    );

    sendAssets(marketItem.ownerAddress, marketItem.price * quantity - royalty);

    // pay commission to the market place
    sendAssets(owner(), commission);

    userListedTokens[marketItem.ownerAddress][marketItem.nftContract][
      marketItem.nftTokenId
    ] = marketItem.remainingQuantity;

    // transfer the nft from owner to the buyer
    transferNFT(
      marketItem.nftContract,
      marketItem.ownerAddress,
      msg.sender,
      marketItem.nftTokenId,
      quantity
    );

    emit SimpleItemSold(listingId, quantity, msg.sender);
  }

  /**
   * @dev Sends out royalties if the NFT supports royalties
   * @param nftContract The NFT contract address
   * @param tokenId NFT token ID
   * @param totalPrice Price for a single token * quantity.
   * @return royalty The calculated and transferred total royalty
   */
  function handleRoyalty(
    address nftContract,
    uint256 tokenId,
    uint256 totalPrice
  ) internal returns (uint256 royalty) {
    if (nftContract.supportsInterface(InterfaceId_ERC2981)) {
      (address receiver, uint256 royaltyAmount) = IERC2981(nftContract)
        .royaltyInfo(tokenId, totalPrice);

      if (receiver != address(0x0) && royaltyAmount > 0) {
        sendAssets(receiver, royaltyAmount);
        return royaltyAmount;
      }
    }
    return 0;
  }

  /**
   * @dev Cancels a previously created listing
   * @param listingId ID of the listing
   */
  function cancelSimpleListing(uint256 listingId) external whenNotPaused {
    require(listingId <= _listingIds.current(), "Listing doesn't exist");
    SimpleMarketItem storage marketItem = simpleListingIdToMarketItem[
      listingId
    ];

    require(marketItem.ownerAddress == msg.sender, 'Only owner can cancel');
    require(marketItem.remainingQuantity > 0, 'There is nothing to cancel');

    marketItem.remainingQuantity = 0;

    userListedTokens[marketItem.ownerAddress][marketItem.nftContract][
      marketItem.nftTokenId
    ] = 0;

    emit SimpleItemCancelled(listingId);
  }

  /**
   * @dev Sends an amount of the native asset to a receiver
   * @param receiver Receiver of the assets
   * @param amount How much to send
   */
  function sendAssets(address receiver, uint256 amount) internal {
    (bool success, ) = payable(receiver).call{ value: amount, gas: 3000 }('');
    if (!success) {
      // The receiver has refused the assets. Nothing we can do about that.
    }
  }
}
