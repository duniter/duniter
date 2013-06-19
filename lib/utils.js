var pgp = require('node-pgp'),
async   = require('async'),
_       = require('underscore'),
stream  = require('stream');

module.exports.pgp = {};
module.exports.pgp.enarmor = function (raw, done) {
  var asciiArmored = '';
  pgp.formats.enarmor(new pgp.BufferedStream(raw), pgp.consts.ARMORED_MESSAGE).readUntilEnd(function(err, data) {
    if(!err){
      asciiArmored = data.toString().replace(/\[object Object\]/g, "PUBLIC KEY BLOCK");
    }
    done(err, asciiArmored);
  });
};