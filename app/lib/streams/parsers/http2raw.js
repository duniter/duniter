var stream = require('stream');
var util   = require('util');

module.exports = {
  // amendment:     instanciate.bind(null, Amendment),
  // vote:          instanciate.bind(null, Vote),
  pubkey:        instanciate.bind(null, Http2RawPubkey),
  // transaction:   instanciate.bind(null, Transaction),
  // peer:          instanciate.bind(null, Peer),
  // forward:       instanciate.bind(null, Forward),
  // status:        instanciate.bind(null, Status),
  // wallet:        instanciate.bind(null, Wallet),
  // membership:    instanciate.bind(null, Membership),
  // voting:        instanciate.bind(null, Voting),
  // communityFlow: instanciate.bind(null, Communityflow),
};

function instanciate (constructorFunc, req, onError) {
  return new constructorFunc(req, onError);
};

function Http2RawPubkey (req, onError) {
  
  stream.Readable.call(this);

  this._read = function () {
    console.log('HTTP -> RAW');
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

util.inherits(Http2RawPubkey, stream.Readable);
