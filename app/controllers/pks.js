var fs    = require('fs'),
util      = require('util'),
async     = require('async'),
mongoose  = require('mongoose'),
PublicKey = mongoose.model('PublicKey'),
Merkle    = mongoose.model('Merkle'),
_         = require('underscore'),
stream    = require('stream');

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

module.exports.all = function (req, res) {
  async.waterfall([
    function (next){
      Merkle.forPublicKeys(next);
    },
    function (merkle, next){
      Merkle.processForURL(req, merkle, function (hashes, done) {
        PublicKey
        .find({ fingerprint: { $in: hashes } })
        .sort('fingerprint')
        .exec(function (err, pubkeys) {
          var map = {};
          pubkeys.forEach(function (pubkey){
            map[pubkey.fingerprint] = pubkey.raw;
          });
          done(null, map);
        });
      }, next);
    }
  ], function (err, json) {
    if(err){
      res.send(500, err);
      return;
    }
    merkleDone(req, res, json);
  });
};

module.exports.lookup = function (req, res) {
  var op = req.query.op;
  var pattern = req.query.search;
  if(pattern !== undefined){
    PublicKey.search(pattern, function (err, foundKeys) {
      switch(op){
        case 'get':
          var count = foundKeys.length;
          var armor = '';
          if(foundKeys.length > 0){
            count = 1;
            armor = foundKeys[0].raw;
          }
          res.render('../app/views/pks/lookup_get.ejs', {"armor": armor, "search": pattern, "nbKeys": foundKeys.length}, function (err, text) {
            res.writeHead(200, {"Content-type": "text/html"});
            res.end(text);
          });
          break;
        case 'index':
          var cleaned = [];
          foundKeys.forEach(function (k) {
            cleaned.push(k.json());
          });
          res.writeHead(200);
          res.end(JSON.stringify({"keys": cleaned}));
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

function getAAMessage(keytext, callback) {
  if(keytext){
    var extractPK = keytext.trim().match(/(-----BEGIN PGP[\s\S]*-----END PGP.*-----)/);
    if(extractPK && extractPK.length > 1){
      var asciiArmored = extractPK[1];
      callback(null, asciiArmored);
    }
    else{
      callback("Not a PGP message.");
    }
  }
  else{
    callback("keytext HTTP param is null.");
  }
}

function getAsciiArmoredMessages(body, files, callback) {
  var keytext = body.keytext || (files ? files.keytext : "");
  var keysign = body.keysign || (files ? files.keysign : "");
  var aaPubkey, aaSignature;
  async.parallel({
      one: function(done){
        if(keytext && keytext.path){
          fs.readFile(keytext.path, {encoding: "utf8"}, function (err, data) {
            keytext = data;
            done(err);
          });
        }
        else done();
      },
      two: function(done){
        if(keysign && keysign.path){
          fs.readFile(keysign.path, {encoding: "utf8"}, function (err, data) {
            keysign = data;
            done(err);
          });
        }
        else done();
      }
  },
  function(err) {
    if(err){
      callback(err);
      return;
    }
    async.parallel({
        one: function(done){
          getAAMessage(keytext, function (err, data) {
            aaPubkey = data;
            done(err);
          });
        },
        two: function(done){
          getAAMessage(keysign, function (err, data) {
            aaSignature = data;
            done(err);
          });
        }
    },
    function(err) {
      callback(err, aaPubkey, aaSignature);
    });
  });
}

// TODO: refactor
module.exports.add = function (req, res) {
  getAsciiArmoredMessages(req.body, req.files, function (err, aaPubkey, aaSignature) {
    if(!err){
      var pubKeys = [];
      PublicKey.verify(aaPubkey, aaSignature, function (err) {
        if(!err){
          pubKeys.push(new PublicKey({ raw: aaPubkey }));
          async.each(pubKeys, processRawKey, function (err) {
            if(!err){
              // Now has entity from aaPubkey
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
                    }], function (err, pubkey) {
                      if(!err){
                        // Update Merkle
                        async.waterfall([
                          function (next) {
                            Merkle.forPublicKeys(function (err, merkle) {
                              next(err, merkle);
                            });
                          },
                          function (merkle, next) {
                            merkle.push(pubkey.fingerprint);
                            merkle.save(function (err) {
                              next(err);
                            });
                          }
                        ], function (err, result) {
                          if(err){
                            console.error(err);
                          }
                        });
                      }
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
                  var pk = pubKeys[0];
                  res.writeHead(200);
                  res.end(JSON.stringify(pk.json()));
                }
                else{
                  res.send(500, 'Error saving to database: ' + err);
                }
              });
            }
            else
              res.send(500, 'Error asciiArmoring back: ' + err);
          });
        }
        else
          res.send(400, 'Error verifying public key: ' + err);
      });
    }
    else
      res.send(400, 'Not a OpenPGP data: ' + err);
  });
};

function merkleDone(req, res, json) {
  if(req.query.nice){
    res.setHeader("Content-Type", "text/plain");
    res.end(JSON.stringify(json, null, "  "));
  }
  else res.end(JSON.stringify(json));
}
