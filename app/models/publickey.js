var jpgp     = require('../lib/jpgp');
var mongoose = require('mongoose');
var async    = require('async');
var sha1     = require('sha1');
var _        = require('underscore');
var vucoin   = require('vucoin');
var Schema   = mongoose.Schema;
var log4js   = require('log4js');
var logger   = log4js.getLogger('pubkey');

var PublicKeySchema = new Schema({
  raw: String,
  fingerprint: { type: String, unique: true },
  signature: String,
  name: String,
  email: String,
  comment: String,
  hash: String,
  propagated: { type: Boolean, default: false },
  sigDate: { type: Date, default: function(){ return new Date(0); } },
  created: { type: Date, default: Date.now },
  updated: { type: Date, default: Date.now }
});

PublicKeySchema.pre('save', function (next) {
  this.updated = Date.now();
  next();
});

PublicKeySchema.methods = {
  
  construct: function(done) {
    var obj = this;
    var k = jpgp().certificate(obj.raw);
    obj.fingerprint = k.fingerprint;
    obj.hash = sha1(obj.raw).toUpperCase();
    var uid = k.uids[0];
    var extract = uid.match(/([\s\S]*) \(([\s\S]*)\) <([\s\S]*)>/);
    if(extract && extract.length === 4){
      obj.name = extract[1];
      obj.comment = extract[2];
      obj.email = extract[3];
    }
    else{
      extract = uid.match(/([\s\S]*) <([\s\S]*)>/);
      if(extract && extract.length === 3){
        obj.name = extract[1];
        obj.comment = '';
        obj.email = extract[2];
      } else {
        extract = uid.match(/([\s\S]*) \(([\s\S]*)\)/);
        if(extract && extract.length === 3) {
        obj.name = extract[1];
          obj.comment = extract[2];
          obj.email = "";
        } else {
          obj.name = "";
          obj.comment = "";
          obj.email = "";
        }
      }
    }
    done();
  },

  json: function () {
    var raw = this.raw.replace('-----BEGIN PGP PUBLIC KEY BLOCK-----', 'BEGIN PGP PUBLIC KEY BLOCK');
    raw = raw.replace('-----END PGP PUBLIC KEY BLOCK-----', 'END PGP PUBLIC KEY BLOCK');
    return {
      "signature": this.signature,
      "key": {
        "email": this.email,
        "name": this.name,
        "fingerprint": this.fingerprint,
        "comment": this.comment,
        "raw": raw
      }
    };
  },

  getRaw: function () {
    return this.raw;
  }
};

PublicKeySchema.statics.getTheOne = function (keyID, done) {
  PublicKey.search("0x" + keyID, function (err, keys) {
    if(keys.length > 1){
      done('Multiple PGP keys found for this keyID.');
      return;
    }
    if(keys.length < 1){
      done('Corresponding Public Key (0x' + keyID + ') not found.');
      return;
    }
    var pubkey = keys[0];
    done(null, pubkey);
  });
};

PublicKeySchema.statics.getFromSignature = function (asciiArmoredsig, done) {
  var keyID = jpgp().signature(asciiArmoredsig).issuer();
  if(!(keyID && keyID.length == 16)){
    done('Cannot identify signature issuer`s keyID: ' + keyID);
    return;
  }
  this.getTheOne(keyID, done);
};

PublicKeySchema.statics.search = function (motif, done) {
  var obj = this;
  var found = [];
  var fprPattern = motif.match(/^0x(.*)$/);
  var searchByUID = {
    byName: function(callback){
      obj.find({ name: new RegExp(motif, 'i')}, function (err, keys) {
        found.push(keys);
        callback();
      });
    },
    byEmail: function(callback){
      obj.find({ email: new RegExp(motif, 'i')}, function (err, keys) {
        found.push(keys);
        callback();
      });
    },
    byComment: function(callback){
      obj.find({ comment: new RegExp(motif, 'i')}, function (err, keys) {
        found.push(keys);
        callback();
      });
    }
  };
  var searchByFingerprint = {
    byFingerprint: function (callback) {
      var fpr = fprPattern ? fprPattern[1] : "";
      obj.find({ fingerprint: new RegExp(fpr, 'i')}, function (err, keys) {
        found.push(keys);
        callback();
      });
    }
  };
  var searchFunc = fprPattern ? searchByFingerprint : searchByUID;
  async.parallel(searchFunc, function(err) {
    var pubKeys = {};
    var foundKeys = _(found).flatten();
    async.each(foundKeys, function (key, done) {
      pubKeys[key.id] = key;
      done();
    }, function (err) {
      done(err, _(pubKeys).values());
    });
  });
};

PublicKeySchema.statics.verify = function (asciiArmored, signature, done) {
  if(signature){
    async.waterfall([
      function (next){
        try{
          var keyID = jpgp().signature(signature).issuer();
          var cert = jpgp().certificate(asciiArmored);
          var fpr = cert.fingerprint;
          if(!keyID){
            next('Cannot find issuer of signature');
            return;
          }
          if(!fpr){
            next('Cannot extract fingerprint from certificate');
            return;
          }
          if(fpr.indexOf(keyID) == -1){
            next('This certificate is not owned by the signatory');
            return;
          }
          next();
        }
        catch(ex){
          next(ex.toString());
        }
      },
      function (next){
        jpgp()
          .publicKey(asciiArmored)
          .data(asciiArmored)
          .noCarriage()
          .signature(signature)
          .verify(next);
      }
    ], done);
  }
  else done('Signature is empty', false);
};

PublicKeySchema.statics.persistFromRaw = function (rawPubkey, rawSignature, done) {
  var pubkey = new PublicKey({ raw: rawPubkey, signature: rawSignature });
  async.waterfall([
    function (next){
      pubkey.construct(next);
    },
    function (next){
      PublicKey.persist(pubkey, next);
    }
  ], done);
}

// Persistance lock to avoid duplicates
var persistQueue = async.queue(function (fingerprint, persistTask) {
  // logger.debug('Persisting pubkey %s', fingerprint);
  persistTask();
}, 1);

PublicKeySchema.statics.persist = function (pubkey, done) {
  async.waterfall([
    function (next){
      try{
        pubkey.sigDate = jpgp().signature(pubkey.signature).signatureDate();
      }
      catch(ex){}
      next();
    },
    function (next) {
      persistQueue.push(pubkey.fingerprint, function(){
        var now = new Date();
        PublicKey.find({ fingerprint: pubkey.fingerprint }, function (err, foundKeys) {
          if (foundKeys.length == 0) {
            foundKeys.push(new PublicKey({
              fingerprint: pubkey.fingerprint,
              created: now
            }));
          }
          if(foundKeys[0].sigDate >= pubkey.sigDate){
            next('Key update is possible only for more recent signature');
            return;
          }
          foundKeys[0].raw = pubkey.raw;
          foundKeys[0].signature = pubkey.signature;
          foundKeys[0].email = pubkey.email;
          foundKeys[0].name = pubkey.name;
          foundKeys[0].comment = pubkey.comment;
          foundKeys[0].sigDate = pubkey.sigDate;
          foundKeys[0].hash = pubkey.hash;
          foundKeys[0].updated = now;
          foundKeys[0].propagated = false;
          foundKeys[0].save(function (err) {
            next(err);
          });
        });
      });
    },
    function (next){
      var KeyService = require('../service').Key;
      KeyService.setKnown(pubkey.fingerprint, next);
    },
    function (next) {
      PublicKey.verify(pubkey.raw, pubkey.signature, function (err, verified) {
        // Update Merkle
        if(!err && verified){
          mongoose.model('Merkle').addPublicKey(pubkey.fingerprint, function (err) {
            next(err);
          });
        }
        else{
          mongoose.model('Merkle').removePublicKey(pubkey.fingerprint, function (err) {
            next(err);
          });
        }
      });
    }
  ], function (err) {
    if (!err) {
      logger.debug('✔ %s', pubkey.fingerprint);
    }
    done(err);
  });
};

PublicKeySchema.statics.getForPeer = function (peer, done) {
  async.waterfall([
    function (next){
      PublicKey.find({ fingerprint: peer.fingerprint }, next);
    },
    function (keys, next){
      if(keys.length > 0){
        next(null, keys[0]);
      }
      else{
        async.waterfall([
          function (next){
            logger.debug("⟳ Retrieving peer %s public key", peer.fingerprint);
            vucoin(peer.getIPv6() || peer.getIPv4() || peer.getDns(), peer.getPort(), true, true, next);
          },
          function (node, next){
            node.ucg.pubkey(next);
          },
          function (rawPubkey, signature, next){
            var cert = jpgp().certificate(rawPubkey);
            if(!cert.fingerprint.match(new RegExp("^" + peer.fingerprint + "$", "g"))){
              next('Peer\'s public key ('+cert.fingerprint+') does not match peering (' + peer.fingerprint + ')');
              return;
            }
            PublicKey.persistFromRaw(rawPubkey, signature, function (err) {
              next();
            });
          },
          function (next){
            PublicKey.find({ fingerprint: peer.fingerprint }, function (err, pubkeys) {
              if(pubkeys.length > 0) next(null, pubkeys[0]);
              else if(pubkeys.length == 0) next('Error getting public key for peer ' + peer.getURL());
            });
          },
        ], next);
      }
    },
  ], done);
}

var PublicKey = mongoose.model('PublicKey', PublicKeySchema);
