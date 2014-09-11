var dos2unix = require('./dos2unix');

module.exports = new function() {

  var that = this;

  this.getIdentity = function (json) {
    var raw = "";
    raw += json.pubkey + '\n';
    raw += "UID:" + json.uid + '\n';
    raw += "META:TS:" + json.time.timestamp() + '\n';
    raw += json.sig + '\n';
    json.certs.forEach(function(cert){
      raw += [cert.from, json.pubkey, cert.time.timestamp(), cert.sig].join(':') + '\n';
    });
    return dos2unix(raw);
  };

  this.getSelfIdentity = function (json) {
    var raw = "";
    raw += "UID:" + json.uid + '\n';
    raw += "META:TS:" + json.time.timestamp() + '\n';
    return dos2unix(raw);
  };

  this.getAmendment = function (json) {
    var raw = "";
    raw += "Version: " + json.version + "\n";
    raw += "Currency: " + json.currency + "\n";
    raw += "Number: " + json.number + "\n";
    raw += "GeneratedOn: " + json.generated + "\n";
    if(json.dividend){
      raw += "UniversalDividend: " + json.dividend + "\n";
      raw += "CoinAlgo: " + json.coinAlgo + "\n";
      raw += "CoinBase: " + json.coinBase + "\n";
      raw += "CoinList: " + json.coinList.join(' ') + "\n";
    }
    if(json.previousHash){
      raw += "PreviousHash: " + json.previousHash + "\n";
    }
    if(json.membersRoot){
      raw += "MembersRoot: " + json.membersRoot + "\n";
      raw += "MembersCount: " + json.membersCount + "\n";
      raw += "MembersChanges:\n";
      for(var i = 0; i < json.membersChanges.length; i++){
        raw += json.membersChanges[i] + "\n";
      }
    }
    return dos2unix(raw);
  };

  this.getPubkey = function (json) {
    return dos2unix(json.raw);
  };

  this.getTransactionWithoutSignature = function (json) {
    var raw = "";
    raw += "Version: " + json.version + "\n";
    raw += "Currency: " + json.currency + "\n";
    raw += "Sender: " + json.sender + "\n";
    raw += "Number: " + json.number + "\n";
    if(json.previousHash){
      raw += "PreviousHash: " + json.previousHash + "\n";
    }
    raw += "Recipient: " + json.recipient + "\n";
    raw += "Coins:\n";
    for(var i = 0; i < json.coins.length; i++){
      raw += json.coins[i] + "\n";
    }
    raw += "Comment:\n" + json.comment;
    if (!raw.match(/\n$/))
      raw += '\n';
    return dos2unix(raw);
  };

  this.getTransaction = function (json) {
    return dos2unix(signed(that.getTransactionWithoutSignature(json), json));
  };

  this.getPeerWithoutSignature = function (json) {
    var raw = "";
    raw += "Version: " + json.version + "\n";
    raw += "Currency: " + json.currency + "\n";
    raw += "Fingerprint: " + json.fingerprint + "\n";
    raw += "Endpoints:" + "\n";
    json.endpoints.forEach(function(ep){
      raw += ep + "\n";
    });
    return dos2unix(raw);
  };

  this.getPeer = function (json) {
    return dos2unix(signed(that.getPeerWithoutSignature(json), json));
  };

  this.getForwardWithoutSignature = function (json) {
    var raw = "";
    raw += "Version: " + json.version + "\n";
    raw += "Currency: " + json.currency + "\n";
    raw += "From: " + json.from + "\n";
    raw += "To: " + json.to + "\n";
      raw += "Forward: " + json.forward + "\n";
    if(json.keys && json.keys.length > 0){
      raw += "Keys:\n";
      for(var i = 0; i < json.keys.length; i++){
        raw += json.keys[i] + "\n";
      }
    }
    return dos2unix(raw);
  };

  this.getForward = function (json) {
    return dos2unix(signed(that.getForwardWithoutSignature(json), json));
  };

  this.getStatusWithoutSignature = function (json) {
    var raw = "";
    raw += "Version: " + json.version + "\n";
    raw += "Currency: " + json.currency + "\n";
    raw += "Status: " + json.status + "\n";
    raw += "From: " + json.from + "\n";
    raw += "To: " + json.to + "\n";
    return dos2unix(raw);
  };

  this.getStatus = function (json) {
    return dos2unix(signed(that.getStatusWithoutSignature(json), json));
  };

  this.getWalletWithoutSignature = function (json) {
    var raw = "";
    raw += "Version: " + json.version + "\n";
    raw += "Currency: " + json.currency + "\n";
    raw += "Key: " + json.fingerprint + "\n";
    raw += "Date: " + json.date.timestamp() + "\n";
    raw += "RequiredTrusts: " + json.requiredTrusts + "\n";
    raw += "Hosters:\n";
    json.hosters.forEach(function (fingerprint) {
      raw += fingerprint + "\n";
    });
    raw += "Trusts:\n";
    json.trusts.forEach(function (fingerprint) {
      raw += fingerprint + "\n";
    });
    return dos2unix(raw);
  };

  this.getWallet = function (json) {
    return dos2unix(signed(that.getWalletWithoutSignature(json), json));
  };

  this.getMembershipWithoutSignature = function (json) {
    var raw = "";
    raw += "Version: " + json.version + "\n";
    raw += "Currency: " + json.currency + "\n";
    raw += "Issuer: " + json.issuer + "\n";
    raw += "Date: " + json.date.timestamp() + "\n";
    raw += "Membership: " + json.membership + "\n";
    raw += "UserID: " + json.userid + "\n";
    return dos2unix(raw);
  };

  this.getMembership = function (json) {
    return dos2unix(signed(that.getMembershipWithoutSignature(json), json));
  };

  var KEYBLOCK_PUBK_PREFIX = "#####----";
  var KEYBLOCK_PUBK_SUFFIX = "----#####";

  this.getKeyblockWithoutSignature = function (json) {
    var raw = "";
    raw += "Version: " + json.version + "\n";
    raw += "Type: KeyBlock\n";
    raw += "Currency: " + json.currency + "\n";
    raw += "Nonce: " + json.nonce + "\n";
    raw += "Number: " + json.number + "\n";
    raw += "Timestamp: " + json.timestamp + "\n";
    if(json.number > 0){
      raw += "PreviousHash: " + json.previousHash + "\n";
      raw += "PreviousIssuer: " + json.previousIssuer + "\n";
    }
    raw += "MembersCount: " + json.membersCount + "\n";
    raw += "MembersRoot: " + json.membersRoot + "\n";
    raw += "MembersChanges:\n";
    for(var i = 0; i < json.membersChanges.length; i++){
      raw += json.membersChanges[i] + "\n";
    }
    raw += "KeysChanges:\n";
    for(var i = 0; i < json.keysChanges.length; i++){
      raw += this.getKeychange(json.keysChanges[i]);
    }
    return dos2unix(raw);
  };

  this.getKeyblock = function (json) {
    return dos2unix(signed(that.getKeyblockWithoutSignature(json), json));
  };

  var KEYCHANGE_PREFIX = "#####----";
  var KEYCHANGE_SUFFIX = "----#####";

  this.getKeychangeWithoutSignature = function (json) {
    var raw = KEYCHANGE_PREFIX + json.type + ":" + json.fingerprint + KEYCHANGE_SUFFIX + "\n";
    if (json.keypackets)
      raw += "KeyPackets:\n" + json.keypackets;
    if (!raw.match(/\n$/))
      raw += '\n';
    if (json.certpackets)
      raw += "CertificationPackets:\n" + json.certpackets;
    if (!raw.match(/\n$/))
      raw += '\n';
    if (json.membership && json.membership.membership) {
      raw += "Membership:\n";
      raw += json.membership.membership + "\n";
      raw += json.membership.signature;
    }
    return dos2unix(raw);
  };

  this.getKeychange = function (json) {
    return dos2unix(signed(that.getKeychangeWithoutSignature(json), json));
  };

  function signed (raw, json) {
    if (json.signature)
      raw += json.signature;
    return raw;
  }
}
