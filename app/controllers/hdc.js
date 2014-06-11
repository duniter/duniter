
module.exports = function (hdcServer) {
  return new HDCBinding(hdcServer);
}

function HDCBinding (hdcServer) {

  this.amendments = require('./amendments')(hdcServer);
  this.transactions = require('./transactions')(hdcServer);
  this.coins = require('./coins')(hdcServer);
}
