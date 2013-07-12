var fs  = require('fs'),
util    = require('util'),
async   = require('async'),
orm     = require('orm'),
_       = require('underscore'),
stream  = require('stream');

module.exports.init = function (initKeys, req, res) {
  var PublicKey = req.models.PublicKey;
  var pubkeys = [];
  async.forEach(initKeys, function (initkey, done) {
    var pk = new PublicKey({ raw:initkey.data });
    pk.construct(function (err) {
      pubkeys.push(pk);
      done(err);
    });
  }, function (err) {
    if(err)
      res.send(503, err);
    else{
      res.writeHead(200, {"Content-type": "text/plain"});
      res.end(JSON.stringify(pubkeys));
    }
  });
};

module.exports.submit = function (req, res) {
};

module.exports.members = function (req, res) {
};

module.exports.self = function (req, res) {
};

module.exports.voters = function (req, res) {
};

module.exports.vote = function (req, res) {
};