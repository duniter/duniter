var pgp = require('node-pgp'),
fs      = require('fs'),
util    = require('util'),
async   = require('async'),
orm     = require('orm'),
_       = require('underscore'),
stream  = require('stream');

function extractPublicKeys (data, callback) {
  var pubKeys = [];
  var i = -1;
  pgp.packets.splitPackets(data).forEachSeries(function(type, header, body, next) {
    if(type == pgp.consts.PKT.PUBLIC_KEY){
      i++;
      pubKeys.push({ raw: new Buffer(0) });
    }
    if(i >= 0){
      pubKeys[i].raw = Buffer.concat([pubKeys[i].raw, header, body]);
    }
    next();
  }, function(err) {
    if(!err)
      callback(pubKeys);
    else
      callback([]);
  });
}

function processRawKey (pubkey, done) {
  async.parallel([
    function (callback) {
      enarmor(pubkey, callback);
    },
    function (callback) {
      entitify(pubkey, callback);
    }
  ], function (err) {
    // Brand new key struture is done.
    done(err);
  });
}

function enarmor (pubkey, done) {
  pgp.formats.enarmor(new pgp.BufferedStream(pubkey.raw), pgp.consts.ARMORED_MESSAGE).readUntilEnd(function(err, data) {
    if(!err){
      pubkey.asciiArmored = data.toString().replace(/\[object Object\]/g, "PUBLIC KEY BLOCK");
    }
    done(err);
  });
}

function save (model, pubkey, done) {
  var now = new Date();
  model.create([{
    raw: pubkey.raw,
    fingerprint: pubkey.fingerprint,
    email: pubkey.email,
    name: pubkey.name,
    comment: pubkey.comment,
    created: now,
    updated: now
  }], function (err, items) {
    console.log("Saved " + pubkey.fingerprint + ".");
    done(err);
  });
}

function entitify (pubkey, done) {
  pgp.packets.splitPackets(pubkey.raw).forEachSeries(function(type, header, body, next) {
    pgp.packetContent.getPacketInfo(type, body, function (err, infos) {
      switch(type){
        case pgp.consts.PKT.PUBLIC_KEY:
          pubkey.fingerprint = infos.fingerprint;
          break;
        case pgp.consts.PKT.USER_ID:
          pubkey.name = infos.name;
          pubkey.email = infos.email;
          pubkey.comment = infos.comment;
          break;
      }
      next();
    });
  }, function(err) {
    done(err);
  });
}

module.exports.lookup = function (req, res) {
  var op = req.query.op;
  var pattern = req.query.search;
  if(pattern !== undefined){
    req.models.PublicKey.search(pattern, function (err, foundKeys) {
      var pubKeys = {};
      async.each(foundKeys, function (key, done) {
        pubKeys[key.fingerprint] = key;
        done();
      }, function (err) {
        res.render('../views/pks/lookup.ejs', {"pubKeys": _(pubKeys).values()}, function (err, text) {
          res.writeHead(200, {"Content-type": "text/plain"});
          res.end(text);
        });
      });
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
      pgp.formats.dearmor(new pgp.BufferedStream(asciiArmored)).readUntilEnd(function(err, data) {
        if(!err){
          extractPublicKeys(data, function (pubKeys) {
            async.each(pubKeys, processRawKey, function (err) {
              if(!err){
                // Now has entity + asciiArmored
                async.each(pubKeys, _(save).partial(req.models.PublicKey), function (err) {
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
          });
        }
        else
          res.send(500, 'Error dearmoring packet:' + err);
      });
    }
    else
      res.send(400, 'Not a OpenPGP key.');
  }
  else{
    res.send(400, 'No data sent.');
  }
};