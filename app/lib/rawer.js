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
      raw += [cert.from, json.pubkey, cert.block_number, cert.sig].join(':') + '\n';
    });
    return dos2unix(raw);
  };

  this.getSelfIdentity = function (json) {
    var raw = "";
    raw += "UID:" + json.uid + '\n';
    raw += "META:TS:" + json.time.timestamp() + '\n';
    return dos2unix(raw);
  };

  this.getPubkey = function (json) {
    return dos2unix(json.raw);
  };

  this.getPeerWithoutSignature = function (json) {
    var raw = "";
    raw += "Version: " + json.version + "\n";
    raw += "Type: Peer\n";
    raw += "Currency: " + json.currency + "\n";
    raw += "PublicKey: " + json.pub + "\n";
    raw += "Block: " + json.block + "\n";
    raw += "Endpoints:" + "\n";
    json.endpoints.forEach(function(ep){
      raw += ep + "\n";
    });
    return dos2unix(raw);
  };

  this.getPeer = function (json) {
    return dos2unix(signed(that.getPeerWithoutSignature(json), json));
  };

  this.getStatusWithoutSignature = function (json) {
    var raw = "";
    raw += "Version: " + json.version + "\n";
    raw += "Type: Status\n";
    raw += "Currency: " + json.currency + "\n";
    raw += "Status: " + json.status + "\n";
    raw += "Block: " + json.block + "\n";
    raw += "From: " + json.from + "\n";
    raw += "To: " + json.to + "\n";
    return dos2unix(raw);
  };

  this.getStatus = function (json) {
    return dos2unix(signed(that.getStatusWithoutSignature(json), json));
  };

  this.getMembershipWithoutSignature = function (json) {
    var raw = "";
    raw += "Version: " + json.version + "\n";
    raw += "Type: Membership\n";
    raw += "Currency: " + json.currency + "\n";
    raw += "Issuer: " + json.issuer + "\n";
    raw += "Block: " + json.block + "\n";
    raw += "Membership: " + json.membership + "\n";
    if (json.userid)
      raw += "UserID: " + json.userid + "\n";
    if (!isNaN(json.certts))
      raw += "CertTS: " + json.certts.timestamp() + "\n";
    return dos2unix(raw);
  };

  this.getMembership = function (json) {
    return dos2unix(signed(that.getMembershipWithoutSignature(json), json));
  };

  this.getBlockWithoutSignature = function (json) {
    var raw = "";
    raw += "Version: " + json.version + "\n";
    raw += "Type: Block\n";
    raw += "Currency: " + json.currency + "\n";
    raw += "Nonce: " + json.nonce + "\n";
    raw += "Number: " + json.number + "\n";
    raw += "PoWMin: " + json.powMin + "\n";
    raw += "Time: " + json.time + "\n";
    raw += "MedianTime: " + json.medianTime + "\n";
    if (json.dividend)
      raw += "UniversalDividend: " + json.dividend + "\n";
    if (json.fees)
      raw += "Fees: " + json.fees + "\n";
    raw += "Issuer: " + json.issuer + "\n";
    if(json.previousHash)
      raw += "PreviousHash: " + json.previousHash + "\n";
    if(json.previousIssuer)
      raw += "PreviousIssuer: " + json.previousIssuer + "\n";
    if(json.parameters)
      raw += "Parameters: " + json.parameters + "\n";
    raw += "MembersCount: " + json.membersCount + "\n";
    raw += "Identities:\n";
    for(var i = 0; i < json.identities.length; i++){
      raw += json.identities[i] + "\n";
    }
    raw += "Joiners:\n";
    for(var i = 0; i < json.joiners.length; i++){
      raw += json.joiners[i] + "\n";
    }
    raw += "Actives:\n";
    for(var i = 0; i < json.actives.length; i++){
      raw += json.actives[i] + "\n";
    }
    raw += "Leavers:\n";
    for(var i = 0; i < json.leavers.length; i++){
      raw += json.leavers[i] + "\n";
    }
    raw += "Excluded:\n";
    for(var i = 0; i < json.excluded.length; i++){
      raw += json.excluded[i] + "\n";
    }
    raw += "Certifications:\n";
    for(var i = 0; i < json.certifications.length; i++){
      raw += json.certifications[i] + "\n";
    }
    raw += "Transactions:\n";
    for(var i = 0; i < json.transactions.length; i++){
      raw += json.transactions[i].raw;
    }
    return dos2unix(raw);
  };

  this.getBlock = function (json) {
    return dos2unix(signed(that.getBlockWithoutSignature(json), json));
  };

  this.getTransaction = function (json) {
    var raw = "";
    raw += "Version: " + json.version + "\n";
    raw += "Type: Transaction\n";
    raw += "Currency: " + json.currency + "\n";
    raw += "Issuers:\n";
    json.issuers.forEach(function (issuer) {
      raw += issuer + '\n';
    });
    raw += "Inputs:\n";
    json.inputs.forEach(function (input) {
      raw += input + '\n';
    });
    raw += "Outputs:\n";
    json.outputs.forEach(function (output) {
      raw += output + '\n';
    });
    raw += "Comment: " + (json.comment || "") + "\n";
    json.signatures.forEach(function (signature) {
      raw += signature + '\n';
    });
    return dos2unix(raw);
  };

  this.getCompactTransaction = function (json) {
    var raw = ["TX", 1, json.issuers.length, json.inputs.length, json.outputs.length, json.comment ? 1 : 0].join(':') + '\n';
    json.issuers.forEach(function (issuer) {
      raw += issuer + '\n';
    }); 
    json.inputs.forEach(function (input) {
      raw += input + '\n';
    });
    json.outputs.forEach(function (output) {
      raw += output + '\n';
    });
    if (json.comment)
      raw += json.comment + '\n';
    json.signatures.forEach(function (signature) {
      raw += signature + '\n';
    });
    return dos2unix(raw);
  };

  function signed (raw, json) {
    if (json.signature)
      raw += json.signature + '\n';
    return raw;
  }
}
