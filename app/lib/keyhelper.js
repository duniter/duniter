var openpgp    = require('openpgp');
var base64     = require('./base64');
var PacketList = openpgp.packet.List;

module.exports = {

  fromKey: function (key){
    return new KeyHelper(key.toPacketlist());
  },

  fromPackets: function (packetList){
    return new KeyHelper(packetList);
  },

  fromEncodedPackets: function (encodedPackets){
    return this.fromDecodedPackets(base64.decode(encodedPackets));
  },

  fromDecodedPackets: function (decodedPackets){
    var list = new openpgp.packet.List();
    list.read(decodedPackets);
    return new KeyHelper(list);
  },

  fromArmored: function (armored){
    var readKeys = openpgp.key.readArmored(armored).keys;
    var packets = new PacketList();
    if(readKeys.length == 1){
      packets = readKeys[0].toPacketlist();
    }
    return new KeyHelper(packets);
  }
};

var UDID2_FORMAT = /udid2;c;/;
// var UDID2_FORMAT = /\(udid2;c;([A-Z-]*);([A-Z-]*);(\d{4}-\d{2}-\d{2});(e\+\d{2}\.\d{2}-\d{3}\.\d{2});(\d+)(;?)\)/;

function KeyHelper (packetList) {

  var that = this;
  var key = new openpgp.key.Key(packetList);

  this.getFingerprint = function (){
    return key && key.primaryKey && key.primaryKey.getFingerprint().toUpperCase();
  };

  this.getUserID = function (param, next){
    var primaryUser = key.getPrimaryUser();
    return primaryUser && primaryUser.user && primaryUser.user.userId && primaryUser.user.userId.userid;
  };

  this.hasValidUdid2 = function (param, next){
    var userid = that.getUserID();
    return userid != null && userid.match(UDID2_FORMAT);
  };

  this.getBase64publicKey = function (){
    var packets = new PacketList();
    if (key.getKeyPacket())
      packets.push(key.getKeyPacket());
    return base64.encode(packets.write());
  };

  this.getBase64primaryUser = function (){
    var primaryUser = key.getPrimaryUser();
    var packets = new PacketList();
    if (primaryUser) {
      packets.push(primaryUser.user.userId);
      packets.push(primaryUser.selfCertificate);
    }
    return primaryUser && base64.encode(packets.write());
  };

  this.getBase64primaryUserOtherCertifications = function (){
    var primaryUser = key.getPrimaryUser();
    var certifs = [];
    if (primaryUser) {
      (primaryUser.user.otherCertifications || []).forEach(function(oCert){
        certifs.push(base64.encode(oCert.write()));
        // oCert.verify(key, { userid: primaryUser.user.userId, key: key }))) {
      });
    }
    return certifs;
  };

  // Give base64 encoded signing subkey packets (subkey + binding)
  this.getBase64subkeys = function (){
    var bSubkeys = [];
    (key.subKeys || []).forEach(function(subkeyWrapper){
      if (subkeyWrapper.isValidSigningKey(key.primaryKey) || subkeyWrapper.isValidEncryptionKey(key.primaryKey)) {
        var packets = new PacketList();
        packets.push(subkeyWrapper.subKey);
        packets.push(subkeyWrapper.bindingSignature);
        bSubkeys.push(base64.encode(packets.write()));
      }
    });
    return bSubkeys;
  };

  this.getPotentials = function (){
    var potentials = [];
    if (that.hasValidUdid2()) {
      potentials.push(that.getBase64publicKey());
      potentials.push(that.getBase64primaryUser());
      that.getBase64primaryUserOtherCertifications().forEach(function(base64SubKey){
        potentials.push(base64SubKey);
      });
      that.getBase64subkeys().forEach(function(base64SubKey){
        potentials.push(base64SubKey);
      });
    }
    return potentials;
  };
}
