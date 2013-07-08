var fs  = require('fs'),
util    = require('util'),
async   = require('async'),
orm     = require('orm'),
_       = require('underscore'),
stream  = require('stream');

function processRawKey (pubkey, done) {
  async.parallel([
    function (callback) {
      pubkey.construct(callback);
    }
  ], function (err) {
    // Brand new key struture is done.
    done(err);
  });
}

module.exports.lookup = function (req, res) {
  var op = req.query.op;
  var pattern = req.query.search;
  if(pattern !== undefined){
    req.models.PublicKey.search(pattern, function (err, foundKeys) {
      switch(op){
        case 'get':
          var count = foundKeys.length;
          var armor = '';
          if(foundKeys.length > 0){
            count = 1;
            armor = foundKeys[0].raw;
          }
          res.render('../views/pks/lookup_get.ejs', {"armor": armor, "search": pattern, "nbKeys": foundKeys.length}, function (err, text) {
            res.writeHead(200, {"Content-type": "text/html"});
            res.end(text);
          });
          break;
        case 'index':
          res.render('../views/pks/lookup.ejs', {"pubKeys": foundKeys}, function (err, text) {
            res.writeHead(200, {"Content-type": "text/plain"});
            res.end(text);
          });
          break;
        default:
          res.send(501, 'Operation not supported.');
          break;
      }
    });
  }
  else{
    res.send(500, 'No interface yet.');
  }
};

module.exports.add = {};

module.exports.add.get = function (req, res) {
  res.render('../views/pks/add.ejs');
};

module.exports.add.post = function (req, res) {
  if(req.body && req.body.keytext){
    var extract = req.body.keytext.trim().match(/(-----BEGIN PGP[\s\S]*-----END PGP.*-----)/);
    if(extract && extract.length > 1){
      var asciiArmored = extract[1];
      var PublicKey = req.models.PublicKey;
      var pubKeys = [new PublicKey({ raw: asciiArmored })];
      async.each(pubKeys, processRawKey, function (err) {
        if(!err){
          // Now has entity from asciiArmored
          async.each(pubKeys, function (pubkey, done) {
            var now = new Date();
            PublicKey.count({fingerprint: pubkey.fingerprint}, function (err, count) {
              if(count === 0){
                PublicKey.create([{
                  raw: pubkey.raw,
                  fingerprint: pubkey.fingerprint,
                  email: pubkey.email,
                  name: pubkey.name,
                  comment: pubkey.comment,
                  created: now,
                  updated: now
                }], function (err, items) {
                  console.log("Created " + pubkey.fingerprint + ".");
                  done(err);
                });
              }
              else{
                PublicKey.find({ fingerprint: pubkey.fingerprint }, function (err, foundKeys) {
                  foundKeys[0].raw = pubkey.raw;
                  foundKeys[0].email = pubkey.email;
                  foundKeys[0].name = pubkey.name;
                  foundKeys[0].comment = pubkey.comment;
                  foundKeys[0].updated = now;
                  foundKeys[0].save(function (err) {
                    console.log("Updated " + pubkey.fingerprint + ".");
                    done(err);
                  });
                });
              }
            });
          }, function (err) {
            // Creates/updates done.
            if(!err){
              res.render('../views/pks/added.ejs', {"pubKeys": pubKeys}, function (err, text) {
                res.writeHead(200, {"Content-type": "text/plain"});
                res.end(text);
              });
            }
            else{
              res.send(500, 'Error saving to database:' + err);
            }
          });
        }
        else
          res.send(500, 'Error asciiArmoring back:' + err);
      });
    }
    else
      res.send(400, 'Not a OpenPGP key.');
  }
  else{
    res.send(400, 'No data sent.');
  }
};