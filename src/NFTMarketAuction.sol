// contracts/Market.sol
// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.4;

import '@openzeppelin/contracts/security/ReentrancyGuard.sol';
import './MarketTools.sol';

/**
 * @title Marketplace contract for auctions
 */
contract NFTMarketAuction is ReentrancyGuard, MarketTools {
  using Counters for Counters.Counter;

  // listingId -> item details
  mapping(uint256 => AuctionMarketItem) public auctionListingIdToMarketItem;

  // Auction market item ID => list of bids
  mapping(uint256 => AuctionBid[]) public auctionBids;

  uint256 MAX_INT = 2**256 - 1;

  struct AuctionMarketItem {
    address nftContract;
    uint256 nftTokenId;
    address priceTokenAddress;
    uint256 startPrice;
    address ownerAddress;
    uint256 deadline;
    bool isClosed;
  }

  struct AuctionBid {
    uint256 bidAmount;
    address bidder;
    bool isCanceled;
  }

  event AuctionItemCreated(uint256 indexed listingId);
  event AuctionBidCreated(
    uint256 indexed listingId,
    uint256 indexed bidIndex,
    uint256 bidAmount
  );
  event AuctionBidCancelled(
    uint256 indexed listingId,
    uint256 indexed bidIndex
  );
  event AuctionBidAccepted(uint256 indexed listingId, uint256 indexed bidIndex);
  event AuctionTerminated(uint256 indexed listingId);
  event AuctionCancelled(uint256 indexed listingId);
  event AuctionExtended(uint256 indexed listingId, uint256 newDeadline);

  /**
   * @dev Initializes the contract
   * @param erc20TokenAddresses List of ERC20 tokens to be whitelisted initially
   */
  constructor(address[] memory erc20TokenAddresses)
    MarketTools(erc20TokenAddresses)
  {}

  /**
   * @dev Gets all the bids for a given auction
   * @param listingId ID of the listing
   * @return AuctionBid[] All bids for the given auction
   */
  function getAuctionBids(uint256 listingId)
    public
    view
    returns (AuctionBid[] memory)
  {
    return auctionBids[listingId];
  }

  /**
   * @dev Creates a new auction item
   * @param nftContract Address of the NFT contract
   * @param nftTokenId Token ID of the NFT
   * @param priceTokenAddress Address of the ERC20 token used for pricing
   * @param startPrice Minimum bid price
   * @param deadline Timestamp when the auction closes
   */
  function createAuctionMarketItem(
    address nftContract,
    uint256 nftTokenId,
    address priceTokenAddress,
    uint256 startPrice,
    uint256 deadline
  ) external nonReentrant whenNotPaused {
    require(deadline > block.timestamp, 'Deadline must be in the future');
    require(
      userListedTokens[msg.sender][nftContract][nftTokenId] == 0,
      'A listing already exists for the token'
    );
    require(
      getNFTOwnerAmount(nftContract, nftTokenId, msg.sender) > 0,
      'Not enough NFTs'
    );
    require(whitelistedERC20[priceTokenAddress], 'Invalid price token');

    // Make sure the owner has given allowance
    bool givenAllowance = IERC721(nftContract).isApprovedForAll(
      msg.sender,
      address(this)
    );
    require(givenAllowance, 'Not allowed to manage tokens');

    _listingIds.increment();
    uint256 listingId = _listingIds.current();

    auctionListingIdToMarketItem[listingId] = AuctionMarketItem(
      nftContract,
      nftTokenId,
      priceTokenAddress,
      startPrice,
      msg.sender,
      deadline,
      false
    );

    userListedTokens[msg.sender][nftContract][nftTokenId] = 1;

    emit AuctionItemCreated(listingId);
  }

  /**
   * @dev Bid on an existing auction item
   * @param listingId ID of the listing
   * @param bidAmount Size of the bid, nominated in the auction's price ERC20 token
   */
  function bid(uint256 listingId, uint256 bidAmount)
    external
    nonReentrant
    whenNotPaused
  {
    require(listingId <= _listingIds.current(), "Listing doesn't exist");
    AuctionMarketItem storage marketItem = auctionListingIdToMarketItem[
      listingId
    ];
    require(!marketItem.isClosed, 'Listing is closed');
    require(
      msg.sender != marketItem.ownerAddress,
      "Auction owner can't place bid on his Auction"
    );
    require(bidAmount >= marketItem.startPrice, 'Too low price');
    require(block.timestamp < marketItem.deadline, 'The auction has ended');
    // Make sure the bidder has given enough allowance
    uint256 givenAllowance = IERC20(marketItem.priceTokenAddress).allowance(
      msg.sender,
      address(this)
    );
    require(givenAllowance >= bidAmount, 'Not enough allowance');

    require(
      IERC20(marketItem.priceTokenAddress).balanceOf(msg.sender) >= bidAmount,
      'Not enough tokens'
    );

    auctionBids[listingId].push(AuctionBid(bidAmount, msg.sender, false));
    if (marketItem.deadline < block.timestamp + 10 minutes) {
      // If deadline is within 10 minutes extend it by 10 minutes
      marketItem.deadline = block.timestamp + 10 minutes;
      emit AuctionExtended(listingId, marketItem.deadline);
    }

    emit AuctionBidCreated(
      listingId,
      auctionBids[listingId].length - 1,
      bidAmount
    );
  }

  /**
   * @dev Cancels a bid created by the caller
   * @param listingId ID of the listing
   * @param bidIndex Index of the bid to cancel
   */
  function cancelBid(uint256 listingId, uint256 bidIndex)
    external
    whenNotPaused
  {
    require(listingId <= _listingIds.current(), "Listing doesn't exist");
    AuctionMarketItem storage marketItem = auctionListingIdToMarketItem[
      listingId
    ];
    require(!marketItem.isClosed, 'Listing is closed');
    require(block.timestamp < marketItem.deadline, 'The auction has ended');
    require(auctionBids[listingId].length > bidIndex, "Bid doesn't exist");
    AuctionBid storage chosenBid = auctionBids[listingId][bidIndex];
    require(chosenBid.bidder == msg.sender, 'Only owner can cancel');
    require(!chosenBid.isCanceled, 'Already canceled');

    chosenBid.isCanceled = true;

    emit AuctionBidCancelled(listingId, bidIndex);
  }

  /**
   * @dev Calculates the best valid bid for a list of bids
   * @param bids List of bids
   * @param priceTokenAddress Address of the used ERC20 price token
   * @return AuctionBid The best bid (empty struct if none found)
   */
  function getBestBid(AuctionBid[] memory bids, address priceTokenAddress)
    public
    view
    virtual
    returns (AuctionBid memory)
  {
    if (bids.length > 0) {
      uint256 highestBidIndex = MAX_INT; // use as "no valid bid found yet"
      for (uint256 i = 0; i < bids.length; i++) {
        if (
          // Check balance and allowance and that it's not canceled
          IERC20(priceTokenAddress).balanceOf(bids[i].bidder) >=
          bids[i].bidAmount &&
          IERC20(priceTokenAddress).allowance(bids[i].bidder, address(this)) >=
          bids[i].bidAmount &&
          !bids[i].isCanceled
        ) {
          // The bid is valid
          if (
            highestBidIndex == MAX_INT || // if no highest valid bid found yet
            bids[i].bidAmount > bids[highestBidIndex].bidAmount
          ) {
            highestBidIndex = i;
          }
        }
      }
      if (highestBidIndex != MAX_INT) {
        return bids[highestBidIndex];
      }
    }
    return AuctionBid(0, address(0x0), false);
  }

  /**
   * @dev Accepts a bid manually to the caller's auction
   * @param listingId ID of the listing
   * @param bidIndex Index of the bid to accept
   */
  function acceptBid(uint256 listingId, uint256 bidIndex)
    external
    whenNotPaused
  {
    require(listingId <= _listingIds.current(), "Listing doesn't exist");
    AuctionMarketItem storage marketItem = auctionListingIdToMarketItem[
      listingId
    ];
    require(!marketItem.isClosed, 'Listing is closed');
    require(marketItem.ownerAddress == msg.sender, 'Only owner can accept');
    require(
      getNFTOwnerAmount(
        marketItem.nftContract,
        marketItem.nftTokenId,
        marketItem.ownerAddress
      ) > 0,
      "Seller doesn't have the NFT"
    );
    require(auctionBids[listingId].length > bidIndex, "Bid doesn't exist");
    AuctionBid memory chosenBid = auctionBids[listingId][bidIndex];

    // Check balance and allowance
    require(
      IERC20(marketItem.priceTokenAddress).balanceOf(chosenBid.bidder) >=
        chosenBid.bidAmount &&
        IERC20(marketItem.priceTokenAddress).allowance(
          chosenBid.bidder,
          address(this)
        ) >=
        chosenBid.bidAmount &&
        !chosenBid.isCanceled,
      'Not a valid bid'
    );

    marketItem.isClosed = true;
    settleAuction(marketItem, chosenBid);

    userListedTokens[marketItem.ownerAddress][marketItem.nftContract][
      marketItem.nftTokenId
    ] = 0;

    emit AuctionBidAccepted(listingId, bidIndex);
  }

  /**
   * @dev Terminates an auction and settles its result
   * @param listingId ID of the listing
   */
  function terminateAuction(uint256 listingId) external whenNotPaused {
    require(listingId <= _listingIds.current(), "Listing doesn't exist");
    AuctionMarketItem storage marketItem = auctionListingIdToMarketItem[
      listingId
    ];
    require(!marketItem.isClosed, 'Already closed');
    require(block.timestamp >= marketItem.deadline, "The auction hasn't ended");
    require(
      getNFTOwnerAmount(
        marketItem.nftContract,
        marketItem.nftTokenId,
        marketItem.ownerAddress
      ) > 0,
      "Seller doesn't have the NFT"
    );
    marketItem.isClosed = true;

    AuctionBid[] memory bids = auctionBids[listingId];

    if (bids.length > 0) {
      // If there are bids
      AuctionBid memory bestBid = getBestBid(
        bids,
        marketItem.priceTokenAddress
      );

      if (bestBid.bidder != address(0x0)) {
        // If a best bid was found
        settleAuction(marketItem, bestBid);
      }
    } else {
      // no bidders
      // no need to do anything
    }

    userListedTokens[marketItem.ownerAddress][marketItem.nftContract][
      marketItem.nftTokenId
    ] = 0;

    emit AuctionTerminated(listingId);
  }

  /**
   * @dev Exchanges assets for the given auction
   * @param marketItem The auction to settle
   * @param chosenBid The bid to settle for in the auction
   */
  function settleAuction(
    AuctionMarketItem storage marketItem,
    AuctionBid memory chosenBid
  ) internal {
    uint256 commission = getPriceAfterPercent(
      chosenBid.bidAmount,
      1,
      commissionPercent
    );

    // Transfers royalty
    uint256 royalty = handleErc20Royalty(
      marketItem.nftContract,
      marketItem.nftTokenId,
      marketItem.priceTokenAddress,
      chosenBid.bidder,
      chosenBid.bidAmount
    );

    // Transfers price
    IERC20(marketItem.priceTokenAddress).transferFrom(
      chosenBid.bidder,
      marketItem.ownerAddress,
      chosenBid.bidAmount - commission - royalty
    );

    // Transfers commission
    IERC20(marketItem.priceTokenAddress).transferFrom(
      chosenBid.bidder,
      owner(),
      commission
    );

    // transfer the nft from owner to buyer
    transferNFT(
      marketItem.nftContract,
      marketItem.ownerAddress,
      chosenBid.bidder,
      marketItem.nftTokenId,
      1
    );
  }

  /**
   * @dev Cancels an auction started by the caller
   * @param listingId ID of the listing
   */
  function cancelAuctionListing(uint256 listingId) external whenNotPaused {
    require(listingId <= _listingIds.current(), "Listing doesn't exist");
    AuctionMarketItem storage marketItem = auctionListingIdToMarketItem[
      listingId
    ];

    require(marketItem.ownerAddress == msg.sender, 'Only owner can cancel');
    require(!marketItem.isClosed, 'Already closed');

    marketItem.isClosed = true;

    userListedTokens[marketItem.ownerAddress][marketItem.nftContract][
      marketItem.nftTokenId
    ] = 0;

    emit AuctionCancelled(listingId);
  }
}
