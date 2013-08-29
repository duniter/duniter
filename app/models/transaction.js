var mongoose = require('mongoose');
var async    = require('async');
var sha1     = require('sha1');
var _        = require('underscore');
var fs       = require('fs');
var hdc      = require('../../node_modules/hdc');
var Schema   = mongoose.Schema;

var TransactionSchema = new Schema({
  version: String,
  currency: String,
  sender: String,
  number: {"type": Number, "default": 0},
  previousHash: String,
  recipient: String,
  type: String,
  coins: Array,
  comment: String,
  hash: String,
  created: Date,
  updated: Date
});

TransactionSchema.methods = {
  
  hdc: function() {
    var tx = new hdc.Transaction(this.getRaw());
    fill(tx, this);
    return tx;
  },
  
  parse: function(rawAmend, callback) {
    var tx = new hdc.Transaction(rawAmend);
    if(!tx.error){
      fill(this, tx);
    }
    callback(tx.error);
  },

  verify: function(currency, done){
    var tx = new hdc.Transaction(this.getRaw());
    tx.verify(currency);
    done(tx.error, tx.errorCode);
  },

  getCoins: function() {
    var coins = [];
    for (var i = 0; i < this.coins.length; i++) {
      var matches = this.coins[i].match(/([A-Z\d]{40})-(\d+)-(\d)-(\d+)-(A|F)-(\d+)(, ([A-Z\d]{40})-(\d+))?/);
      if(matches && matches.length == 10){
        coins.push({
          issuer: matches[1],
          number: parseInt(matches[2], 10),
          base: parseInt(matches[3], 10),
          power: parseInt(matches[4], 10),
          originType: matches[5],
          originNumber: matches[6],
          transaction: matches[7] && {
            sender: matches[8],
            number: matches[9]
          }
        });
      }
    }
    return coins;
  },

  getRaw: function() {
    var raw = "";
    raw += "Version: " + this.version + "\n";
    raw += "Currency: " + this.currency + "\n";
    raw += "Sender: " + this.sender + "\n";
    raw += "Number: " + this.number + "\n";
    if(this.previousHash){
      raw += "PreviousHash: " + this.previousHash + "\n";
    }
    raw += "Recipient: " + this.recipient + "\n";
    raw += "Type: " + this.type + "\n";
    raw += "Coins:\n";
    for(var i = 0; i < this.coins.length; i++){
      raw += this.coins[i] + "\n";
    }
    raw += "Comment:\n" + this.comment;
    return raw.unix2dos();
  }
};

var Transaction = mongoose.model('Transaction', TransactionSchema);

function fill (tx1, tx2) {
  tx1.version      = tx2.version;
  tx1.currency     = tx2.currency;
  tx1.sender       = tx2.sender;
  tx1.number       = tx2.number;
  tx1.previousHash = tx2.previousHash;
  tx1.recipient    = tx2.recipient;
  tx1.type         = tx2.type;
  tx1.coins        = tx2.coins;
  tx1.comment      = tx2.comment;
  tx1.hash         = tx2.hash;
}
