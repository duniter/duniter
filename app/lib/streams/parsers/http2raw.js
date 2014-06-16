var stream = require('stream');
var util   = require('util');

module.exports = {
  vote:          instanciate.bind(null, Http2RawVote),
  pubkey:        instanciate.bind(null, Http2RawPubkey),
  // transaction:   instanciate.bind(null, Transaction),
  // peer:          instanciate.bind(null, Peer),
  // forward:       instanciate.bind(null, Forward),
  // status:        instanciate.bind(null, Status),
  // wallet:        instanciate.bind(null, Wallet),
  // membership:    instanciate.bind(null, Membership),
  // voting:        instanciate.bind(null, Http2RawVoting),
  // communityFlow: instanciate.bind(null, Communityflow),
};

function instanciate (constructorFunc, req, onError) {
  return new constructorFunc(req, onError);
};

function Http2RawPubkey (req, onError) {
  
  stream.Readable.call(this);

  this._read = function () {
    if(!req.body || !req.body.keytext){
      onError('Parameter `keytext` is required');
    }
    else if(!req.body.keytext.match(/BEGIN PGP PUBLIC KEY/) || !req.body.keytext.match(/END PGP PUBLIC KEY/)){
      onError('Keytext does not look like a public key message');
    }
    else {
      this.push(req.body.keytext);
    }
    this.push(null);
  }
}

function Http2RawVote (req, onError) {
  
  stream.Readable.call(this);

  this._read = function () {
    if(!(req.body && req.body.amendment && req.body.signature)){
      onError('Requires an amendment + signature');
    }
    else {
      this.push(req.body.amendment + req.body.signature);
    }
    this.push(null);
  }
}

util.inherits(Http2RawVote,   stream.Readable);
util.inherits(Http2RawPubkey, stream.Readable);
