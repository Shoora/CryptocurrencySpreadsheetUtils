/**
  This is free and unencumbered software released into the public domain.

  Anyone is free to copy, modify, publish, use, compile, sell, or
  distribute this software, either in source code form or as a compiled
  binary, for any purpose, commercial or non-commercial, and by any
  means.
  
  In jurisdictions that recognize copyright laws, the author or authors
  of this software dedicate any and all copyright interest in the
  software to the public domain. We make this dedication for the benefit
  of the public at large and to the detriment of our heirs and
  successors. We intend this dedication to be an overt act of
  relinquishment in perpetuity of all present and future rights to this
  software under copyright law.
  
  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
  EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
  MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
  IN NO EVENT SHALL THE AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR
  OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE,
  ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
  OTHER DEALINGS IN THE SOFTWARE.

  For more information, please refer to <http://unlicense.org/>
  
  # Cryptocurrency Spreadsheet Utils

  Provides useful functions for Google Sheets to get cryptocurrency prices and information.
  For example, to get the current price of Bitcoin you can enter:
  
      =getCoinPrice("BTC")
      
  You can also change the default price API (currently coinmarketcap, coinbin is also supported):
  
      =getCoinPrice("ETH", "coinbin")
      
  Alternatively you can change the DEFAULT_CRYPTO_SERVICE variable below to change it globally.
  
  Other useful functions include retrieving specific attributes from an API. For example, here's how
  to retrieve the current Litecoin rank from Coinbin:
    
      =getCoinAttr("LTC", "rank", "coinbin")
      
  Or here's how to get the 24 hour volume of Ethereum from CoinMarketCap
  
      =getCoinAttr("ETH", "24h_volume_usd", "coinmarketcap")
      

  You can of course also implement your own crypto API partners if Coinbin and CoinMarketCap don't have what you need.
  
  Review the API documentation below to see specific attributes.

  v0.6 — 12/13/2017 — Cleaned up code (thanks @jeromedalbert)
  v0.5 — 11/26/2017 — Fixed multi-coin issue by sorting coins (thanks @jeromedalbert)
  v0.4 — 11/09/2017 — Fixed limit with CoinMarketCap API reponses
  v0.3 — 09/24/2017 — Created pluggable API backends, added Coinbin API, cleaned up code & docs.
  v0.2 — 09/07/2017 — Added refresh() and getCoinAttr() functions by John Harding
  v0.1 — 06/29/2017 — Initial release
  
  ## Planned

  - Handle coins with the same symbol
  - 1-click easy archiving to save data over time
  - Historical trade data
  - Functions for managing trades/accounting/taxes
  
**/

/**
 * Change this to coinbin or coinmarketcap (or implement a new CryptoService below and use that)
 */
var DEFAULT_CRYPTO_SERVICE = "coinmarketcap";

/**************************************************************************************/

/**
 CryptoService API Base Class
 
 Responsible for common functionality between APIs. Likely don't need to change anything here.
 
 Class is initialized with a base API URL that can be modified to return the correct URL for fetching coin info.
**/
function CryptoService(url) {
  this.url = url;
  this.coins = {};
  this.name = this.constructor.name.toLowerCase();
}

/**
 * This is a global cache of available providers. They get registered here after being defined
 */
CryptoService.PROVIDERS = {};

/**
 * Generic fetchURL function, to fetch, retrieve, and parse into JSON content
 */
CryptoService.prototype.fetchURL = function(url) {
  Logger.log("Fetching " + url);

  var response = UrlFetchApp.fetch(url);
  var content = response.getContentText();
  try {
    var data = JSON.parse(content);
  } catch (e) {
    Logger.log("Error while parsing response from API: " + content);
  }
  
  return data;
}

/**
 * Fetch and parse all coins
 */
CryptoService.prototype.fetchAllCoinInfo = function(url) {
  return this.fetchURL(this.getAllCoinsURL());
}

/**
 * Update all coin information. API should have at least once function that
 * can get bulk price information—otherwise it'll be too slow.
 */
CryptoService.prototype.updateAllCoinInfo = function() {
  Logger.log("Updating all coin information");
  var data = this.fetchAllCoinInfo();
  this.coins = this.parseAllCoinData(data);
  Logger.log("Updated " + Object.keys(this.coins).length + " coins");
}

/**
 * Each API handles responses differently, parse coin data into a reasonable format.
 *
 * Currently we don't normalize data, but might in the future. If you want a coin attr,
 * you have to know how that specific API calls it.
 */
CryptoService.prototype.parseAllCoinData = function(data) {
  return data;
};

/**
 * Get all information for a coin. If a coin doesn't exist, attempt to fetch it.
 */
CryptoService.prototype.getCoin = function(symbol) {
  symbol = symbol.toLowerCase();
  if (!this.coins[symbol]) this.updateAllCoinInfo();

  return this.coins[symbol];
}

/**
 * Get a coin attribute, with a potential fallback value
 */
CryptoService.prototype.getCoinAttr = function(symbol, attrName, failValue) {
  var coin = this.getCoin(symbol);
  if (coin) {
    return coin[attrName];
  }
  return failValue;
}

/**
 * Get a float (converted to number) coin attribute, with a potential fallback value
 */
CryptoService.prototype.getCoinFloatAttr = function(symbol, attrName, failValue) {
  if (typeof failValue != "number") {
    failValue = 0;
  }
  
  var coin = this.getCoin(symbol);
  if (coin) {
    return parseFloat(coin[attrName]);
  }
  return failValue;
}

/**
 * Get the coin price
 */
CryptoService.prototype.getCoinPrice = function(symbol) {
  return this.getCoinFloatAttr(symbol, this.getCoinPriceKey());
}

/**
 * Get the coin price key, used in subclasses
 */
CryptoService.prototype.getCoinPriceKey = function(keyAttrName) {
  throw new Error("Implement in sub-class");
}

/**
 * Get the URL for all coin price information, used in subclasses
 */

CryptoService.prototype.getAllCoinsURL = function() {
  throw new Error("Impelement in sub-class");
}

/**************************************************************************************/

/**
 * Coinbin API (https://coinbin.org/)
 *
 * Partial implementation of Coinbin API so we can use it in Google Sheets
 *
 * API structure looks like this, you can grab any of these attributes with getCoinAttr.
 *
 *    {
 *     "coin": {
 *       "btc": 1.00000000, 
 *       "name": "Bitcoin", 
 *       "rank": 1, 
 *       "ticker": "btc", 
 *       "usd": 3689.71
 *     }
 *   }
 */
function Coinbin() {
  CryptoService.call(this, "https://coinbin.org/");
}

/**
 * Setup prototype inheritence for Coinbin. This lets Coinbin use CryptoService as a base class
 * If you implement your own class, you'll need to add this.
 */
Coinbin.prototype = Object.create(CryptoService.prototype);
Coinbin.prototype.constructor = Coinbin;

CryptoService.PROVIDERS["coinbin"] = new Coinbin();

/**
 * Return URL for all coins
 */
Coinbin.prototype.getAllCoinsURL = function() {
  return this.url + "coins";
}

/**
 * Parse data from all coins
 */
Coinbin.prototype.parseAllCoinData = function(data) {
  return data.coins;
}

/**
 * Return key for price
 */
Coinbin.prototype.getCoinPriceKey = function(symbol) {
  return "usd";
}

/**************************************************************************************/

/**
 * CoinMarketCap API (https://api.coinmarketcap.com/v1/)
 *
 * Partial implementation of CoinMarketCap API so we can use it in Google Sheets
 *
 * API structure looks like this, you can grab any of these attributes with getCoinAttr.
 *
 *  {
 *       "id": "bitcoin", 
 *       "name": "Bitcoin", 
 *       "symbol": "BTC", 
 *       "rank": "1", 
 *       "price_usd": "3682.84", 
 *       "price_btc": "1.0", 
 *       "24h_volume_usd": "768015000.0", 
 *       "market_cap_usd": "61081971156.0", 
 *       "available_supply": "16585562.0", 
 *       "total_supply": "16585562.0", 
 *       "percent_change_1h": "-0.59", 
 *       "percent_change_24h": "-2.46", 
 *       "percent_change_7d": "1.0", 
 *       "last_updated": "1506297552"
 * },
 */
function CoinMarketCap() {
  CryptoService.call(this, "https://api.coinmarketcap.com/v1/");
}

/**
 * Setup prototype inheritence for CoinMarketCap. This lets CoinMarketCap use CryptoService as a base class
 * If you implement your own class, you'll need to add this.
 */
CoinMarketCap.prototype = Object.create(CryptoService.prototype);
CoinMarketCap.prototype.constructor = CoinMarketCap;

/**
 * Return URL for all coins
 */
CoinMarketCap.prototype.getAllCoinsURL = function() {
  return this.url + "ticker/?limit=0";
}

/**
 * Parse data from all coins. For CoinMarketCap we have to lowercase the symbol names.
 *
 * If there are coins with the same symbol, only store the one with the highest market cap.
 */
CoinMarketCap.prototype.parseAllCoinData = function(data) {
  var coins = {};
  for (var i in data) {
    var coin = data[i];
    var symbol = coin.symbol.toLowerCase();

    if (coins[symbol] == undefined) {
      coins[symbol] = coin;
    }
    else if (parseFloat(coin.market_cap_usd) > parseFloat(coins[symbol].market_cap_usd)) {
      coins[symbol] = coin;
    }
  }
  return coins;
}

/**
 * Return key for price
 */
CoinMarketCap.prototype.getCoinPriceKey = function() {
  return "price_usd";
}

/**************************************************************************************/

/**
 * Register Crypto API providers
 */
var PROVIDERS = [
  new Coinbin(),
  new CoinMarketCap(),
];
  
/**
 * Private helper function for finding providers by name
 */
function _provider(name) {
  for (var i in PROVIDERS) {
    if (PROVIDERS[i].name == name) {
      return PROVIDERS[i];
    }
  }
}

/**
 * Private cache of currently used APIs. So we know which ones are being used when we refresh
 */

var _apis = {};

/**
 * Private helper function for finding apis by name (with backup to default service)
 */
function _api(service) {
  var api = _apis[service];
  if (!api) {
    api = _provider(service) || _provider(DEFAULT_CRYPTO_SERVICE);
    if (api) {
      _apis[service] = api;
    }
  }
  
  return api;
}

/**************************************************************************************/

/**
 * getCoinPrice
 *
 * Public function for retrieving crypto coin price, from a specific service
 */
function getCoinPrice(symbol, service) {
  return _api(service).getCoinPrice(symbol);
}

/**
 * getCoinAttr
 *
 * Public function for retrieving a crypto coin attr, from a specific service.
 * You must know the name of the attribute from the API you want.
 */
function getCoinAttr(symbol, attr, service) {
  return _api(service).getCoinAttr(symbol, attr);
}

/**
 * getCoinFloatAttr
 *
 * Public function for retrieving a numeric crypto coin attr, from a specific service.
 * You must know the name of the attribute from the API you want. Will be converted to a number.
 */
function getCoinFloatAttr(symbol, attr, service) {
  return _api(service).getCoinFloatAttr(symbol, attr);
}

/**
 * refresh
 *
 * Refresh all currently used APIs and cache bust all =getCoin* functions
 *
 * Google Sheets makes it hard to update data frequently, so we have to add a random timestamp parameter
 * to the end.
 */
function refresh() {
  
  for (var service in _apis) {
    var api = _apis[service];
    api.updateAllCoinInfo();
  }

  var sheet = SpreadsheetApp.getActiveSheet();
  var data = sheet.getDataRange().getFormulas();
  for (var i = 0; i < data.length; i++) {
    var row = data[i]
    for (var j=0; j<row.length; j++) {
      var formula = row[j];
      if (formula.indexOf("=getCoin")==0) {
        sheet.getRange(i+1,j+1).setFormula(_addTimestampArg(formula));
      }
    }
  }
}

/**
 * Private function to add a random timestamp to an end of a formula. This is needed to cache bust the =getCoin* functions
 */
function _addTimestampArg(formula) {
  var now = new Date();
  var partAfterFunction="";
  var parts = formula.split(")");
  if (parts.length>1) partAfterFunction = parts[1];
  var parts = parts[0].split(",");
  var lastPart = parts[parts.length-1];
  var newLastPart = '"ts='+now.getTime()+'")' + partAfterFunction;
  if (lastPart.indexOf("ts=")>0)
    parts[parts.length-1]=newLastPart;
  else {
    parts.push(newLastPart);
  }
  return parts.join(",");
}

/**
 * Create a cryptocurrency menu item to refresh prices
 */
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('Cryptocurrency').addItem('Refresh Prices', 'refresh').addToUi();
}
