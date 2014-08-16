var unix2dos = require('./unix2dos');

module.exports = new function() {

  var that = this;

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
    return unix2dos(raw);
  };

  this.getPubkey = function (json) {
    return unix2dos(json.raw);
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
    return unix2dos(raw);
  };

  this.getTransaction = function (json) {
    return unix2dos(signed(that.getTransactionWithoutSignature(json), json));
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
    return unix2dos(raw);
  };

  this.getPeer = function (json) {
    return unix2dos(signed(that.getPeerWithoutSignature(json), json));
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
    return unix2dos(raw);
  };

  this.getForward = function (json) {
    return unix2dos(signed(that.getForwardWithoutSignature(json), json));
  };

  this.getStatusWithoutSignature = function (json) {
    var raw = "";
    raw += "Version: " + json.version + "\n";
    raw += "Currency: " + json.currency + "\n";
    raw += "Status: " + json.status + "\n";
    raw += "From: " + json.from + "\n";
    raw += "To: " + json.to + "\n";
    return unix2dos(raw);
  };

  this.getStatus = function (json) {
    return unix2dos(signed(that.getStatusWithoutSignature(json), json));
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
    return unix2dos(raw);
  };

  this.getWallet = function (json) {
    return unix2dos(signed(that.getWalletWithoutSignature(json), json));
  };

  this.getMembershipWithoutSignature = function (json) {
    var raw = "";
    raw += "Version: " + json.version + "\n";
    raw += "Currency: " + json.currency + "\n";
    raw += "Issuer: " + json.issuer + "\n";
    raw += "Date: " + json.date.timestamp() + "\n";
    raw += "Membership: " + json.membership + "\n";
    raw += "UserID: " + json.userid + "\n";
    return unix2dos(raw);
  };

  this.getMembership = function (json) {
    return unix2dos(signed(that.getMembershipWithoutSignature(json), json));
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
    raw += "PublicKeys:\n";
    for(var i = 0; i < json.publicKeys.length; i++){
      var packets = json.publicKeys[i].packets;
      raw += KEYBLOCK_PUBK_PREFIX + json.publicKeys[i].fingerprint + KEYBLOCK_PUBK_SUFFIX + '\n';
      raw += packets;
      if (!packets.match(/\n$/))
        raw += '\n';
    }
    raw += "Memberships:\n";
    for(var i = 0; i < json.memberships.length; i++){
      raw += json.memberships[i] + "\n";
    }
    raw += "MembershipsSignatures:\n";
    for(var i = 0; i < json.membershipsSigs.length; i++){
      var packets = json.membershipsSigs[i].packets;
      raw += KEYBLOCK_PUBK_PREFIX + json.membershipsSigs[i].fingerprint + KEYBLOCK_PUBK_SUFFIX + '\n';
      raw += packets;
      if (!packets.match(/\n$/))
        raw += '\n';
    }
    return unix2dos(raw);
  };

  this.getKeyblock = function (json) {
    return unix2dos(signed(that.getKeyblockWithoutSignature(json), json));
  };

  var KEYCHANGE_PREFIX = "#####----";
  var KEYCHANGE_SUFFIX = "----#####";

  this.getKeychangeWithoutSignature = function (json) {
    var raw = KEYCHANGE_PREFIX + json.type + ":" + json.fingerprint + KEYCHANGE_SUFFIX + "\n";
    if (json.keypackets)
      raw += "KeyPackets:\n" + json.keypackets;
    if (json.certpackets)
      raw += "CertificationPackets:\n" + json.certpackets;
    if (json.membership.membership) {
      raw += "Membership:\n";
      raw += json.membership.membership + "\n";
      raw += json.membership.signature;
    }
    return unix2dos(raw);
  };

  this.getKeychange = function (json) {
    return unix2dos(signed(that.getKeychangeWithoutSignature(json), json));
  };

  function signed (raw, json) {
    if (json.signature)
      raw += json.signature;
    return raw;
  }
}
