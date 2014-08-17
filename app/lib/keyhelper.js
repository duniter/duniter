var openpgp    = require('openpgp');
var base64     = require('./base64');
var md5        = require('./md5');
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

  this.hasPrimaryKey = function (){
    return key && key.primaryKey;
  };

  this.getArmored = function (){
    return key.armor();
  };

  this.getUserID = function (){
    var primaryUser = key.getPrimaryUser();
    return primaryUser && primaryUser.user && primaryUser.user.userId && primaryUser.user.userId.userid;
  };

  this.getFounderPackets = function (){
    var packets = new openpgp.packet.List();
    // Primary key
    packets.push(key.primaryKey)
    // UserID
    var primaryUser = key.getPrimaryUser();
    if (primaryUser) {
      packets.push(primaryUser.user.userId);
      packets.push(primaryUser.selfCertificate);
    }
    // Subkeys
    (key.subKeys || []).forEach(function(subkeyWrapper){
      if (subkeyWrapper.isValidSigningKey(key.primaryKey) || subkeyWrapper.isValidEncryptionKey(key.primaryKey)) {
        packets.push(subkeyWrapper.subKey);
        packets.push(subkeyWrapper.bindingSignature);
      }
    });
    return packets;
  };

  this.hasValidUdid2 = function (){
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
        certifs.push(base64.encode(writePacket(oCert)));
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

  this.getHashedSubkeyPackets = function (){
    var subkeys = this.getBase64subkeys(); // Array of 2 packets lists (subkey + binding)
    return this.getHashedPackets(subkeys);
  };

  this.getHashedCertifPackets = function (){
    var certifs = this.getBase64primaryUserOtherCertifications(); // Array of 1 packet lists (signature)
    return this.getHashedPackets(certifs);
  };

  this.getHashedPackets = function (encodedPacketListArray){
    var hash = {};
    encodedPacketListArray.forEach(function(encodedPacketList){
      var md5ed = md5(encodedPacketList);
      hash[md5ed] = encodedPacketList;
    });
    return hash;
  };

  function writePacket (packet) {
    var list = new PacketList();
    list.push(packet);
    return list.write();
  }
}
