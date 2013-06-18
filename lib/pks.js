var pgp = require('node-pgp'),
fs      = require('fs'),
util      = require('util'),
async      = require('async'),
stream  = require('stream');

function extractPublicKeys (data, callback) {
  var pubKeys = [];
  var i = -1;
  pgp.packets.splitPackets(data).forEachSeries(function(type, header, body, next) {
    if(type == pgp.consts.PKT.PUBLIC_KEY){
      i++;
      pubKeys.push({ buffer: new Buffer(0) });
    }
    if(i >= 0){
      pubKeys[i].buffer = Buffer.concat([pubKeys[i].buffer, header, body]);
    }
    next();
  }, function(err) {
    if(!err)
      callback(pubKeys);
    else
      callback([]);
  });
}

function enarmor (pubkey, done) {
  pgp.formats.enarmor(new pgp.BufferedStream(pubkey.buffer), pgp.consts.ARMORED_MESSAGE).readUntilEnd(function(err, data) {
    if(err)
      done(err);
    pubkey.asciiArmored = data;
    done();
  });
}

module.exports = {

	lookup: function (req, res) {
	},

	add: {

    get: function (req, res) {
      res.render('../views/pks/add.ejs');
    },

    post: function (req, res) {
      if(req.body && req.body.keytext){
        var extract = req.body.keytext.trim().match(/(-----BEGIN PGP[\s\S]*-----END PGP.*-----)/);
        if(extract && extract.length > 1){
          var asciiArmored = extract[1];
          pgp.formats.dearmor(new pgp.BufferedStream(asciiArmored)).readUntilEnd(function(err, data) {
            if(!err){
              extractPublicKeys(data, function (pubKeys) {
                async.each(pubKeys, enarmor, function (err) {
                  if(!err){
                    // Now has buffer + asciiArmored
                    res.render('../views/pks/added.ejs', {"pubKeys": pubKeys}, function (err, text) {
                      res.writeHead(200, {"Content-type": "text/plain"});
                      res.end(text);
                    });
                  }
                  else
                    res.send(500, 'Error asciiArmoring back.');
                });
              });
            }
            else
              res.send(500, 'Error dearmoring packet.');
          });
        }
        else
          res.send(400, 'Not a OpenPGP key.');
      }
      else{
        res.send(400, 'No data sent.');
      }
    }
  }
};