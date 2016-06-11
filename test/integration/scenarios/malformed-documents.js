"use strict";
var wallet = require('../tools/wallet');

module.exports = function(node1) {

  var w1 = wallet('abc', '123', node1);

  var malformedTransaction = "Version: 2\n" +
    "Type: Transaction\n" +
    "Currency: null\n" +
    "Issuers:\n" +
    "G2CBgZBPLe6FSFUgpx2Jf1Aqsgta6iib3vmDRA1yLiqU\n" +
    "Inputs:\n" +
    "0:T:1536:539CB0E60CD5F55CF1BE96F067E73BF55C052112:1.0\n" +
    "Outputs:Comment: mon comments\n";

  return [
    w1.sendRaw(malformedTransaction)
  ];
};
