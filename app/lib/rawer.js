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
    raw += "NextRequiredVotes: " + json.nextVotes + "\n";
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
    raw += "VotersRoot: " + json.votersRoot + "\n";
    raw += "VotersCount: " + json.votersCount + "\n";
    raw += "VotersChanges:\n";
    for(var j = 0; j < json.votersChanges.length; j++){
      raw += json.votersChanges[j] + "\n";
    }
    return unix2dos(raw);
  };

  this.getVote = function (json) {
    return unix2dos(signed(that.getAmendment(json.amendment), json));
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
    raw += "Registry: " + json.type + "\n";
    raw += "Issuer: " + json.issuer + "\n";
    raw += "Date: " + json.date.timestamp() + "\n";
    raw += "Membership: " + json.membership + "\n";
    raw += "AmendmentNumber: " + json.amNumber + "\n";
    raw += "AmendmentHash: " + json.amHash + "\n";
    return unix2dos(raw);
  };

  this.getMembership = function (json) {
    return unix2dos(signed(that.getMembershipWithoutSignature(json), json));
  };

  this.getVotingWithoutSignature = function (json) {
    var raw = "";
    raw += "Version: " + json.version + "\n";
    raw += "Currency: " + json.currency + "\n";
    raw += "Registry: " + json.type + "\n";
    raw += "Issuer: " + json.issuer + "\n";
    raw += "Date: " + json.date.timestamp() + "\n";
    raw += "AmendmentNumber: " + json.amNumber + "\n";
    raw += "AmendmentHash: " + json.amHash + "\n";
    return unix2dos(raw);
  };

  this.getVoting = function (json) {
    return unix2dos(signed(that.getVotingWithoutSignature(json), json));
  };

  this.getCommunityFlowWithoutSignature = function (json) {
    var raw = "";
    raw += "Version: " + json.version + "\n";
    raw += "Currency: " + json.currency + "\n";
    raw += "Amendment: " + [json.amendmentNumber, json.amendmentHash].join('-') + "\n";
    raw += "Issuer: " + json.issuer + "\n";
    raw += "Date: " + json.date.timestamp() + "\n";
    raw += "Algorithm: " + json.algorithm + "\n";
    if (json.membersJoiningRoot)
      raw += "MembersJoining: " + [json.membersJoiningCount, json.membersJoiningRoot].join('-') + "\n";
    if (json.membersLeavingRoot)
      raw += "MembersLeaving: " + [json.membersLeavingCount, json.membersLeavingRoot].join('-') + "\n";
    if (json.votersJoiningRoot)
      raw += "VotersJoining: " + [json.votersJoiningCount, json.votersJoiningRoot].join('-') + "\n";
    if (json.votersLeavingRoot)
      raw += "VotersLeaving: " + [json.votersLeavingCount, json.votersLeavingRoot].join('-') + "\n";
    return unix2dos(raw);
  };

  this.getCommunityFlow = function (json) {
    return unix2dos(signed(that.getCommunityFlowWithoutSignature(json), json));
  };

  function signed (raw, json) {
    if (json.signature)
      raw += json.signature;
    return raw;
  }
}
