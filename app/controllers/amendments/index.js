module.exports = function (pgp, currency, conf) {

  this.votes = require('./votes')(pgp, currency, conf);
  
  return this;
}
