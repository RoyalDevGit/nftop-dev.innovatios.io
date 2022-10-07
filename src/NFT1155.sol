// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

// erc 1155
import '@openzeppelin/contracts/token/ERC1155/ERC1155.sol';
import '@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol';
import '@openzeppelin/contracts/token/common/ERC2981.sol';

// utils
import '@openzeppelin/contracts/utils/Counters.sol';

contract NFT1155 is ERC1155, ERC2981 {
  using Counters for Counters.Counter;
  Counters.Counter public _tokensIds; // for minting incrementing
  string public name = 'HowToPulse';
  string public symbol = 'HTP';

  event Mint(uint256 newItemId);

  constructor() ERC1155('') {}

  /**
   * @dev Mints a token
   * @param tokenURI The metadata URL for this NFT (using metadata substitution)
   * @param amount The amount of tokens to mint
   * @param royalty Possible royalty percentage per token, specified in basis points (10000 means 100%)
   */
  function createToken(
    string memory tokenURI,
    uint256 amount,
    uint96 royalty
  ) public returns (uint256) {
    _tokensIds.increment();
    uint256 newItemId = _tokensIds.current();
    // minting
    _mint(msg.sender, newItemId, amount, '00x0');

    _setURI(tokenURI);

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
    override(ERC1155, ERC2981)
    returns (bool)
  {
    return super.supportsInterface(interfaceId);
  }
}
