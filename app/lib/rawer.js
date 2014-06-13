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
    var raw = that.getAmendment(json.amendment);
    raw += json.signature;
    return unix2dos(raw);
  };
}
