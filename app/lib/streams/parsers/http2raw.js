var stream = require('stream');
var util   = require('util');

module.exports = {
  pubkey:        instanciate.bind(null, Http2RawPubkey),
  transaction:   instanciate.bind(null, Http2RawTransaction),
  peer:          instanciate.bind(null, Http2RawPeer),
  forward:       instanciate.bind(null, Http2RawForward),
  status:        instanciate.bind(null, Http2RawStatus),
  wallet:        instanciate.bind(null, Http2RawWallet),
  membership:    instanciate.bind(null, Http2RawMembership),
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

function Http2RawTransaction (req, onError) {
  
  stream.Readable.call(this);

  this._read = function () {
    if(!(req.body && req.body.transaction && req.body.signature)){
      onError('Requires a transaction + signature');
    }
    else {
      this.push(req.body.transaction + req.body.signature);
    }
    this.push(null);
  }
}

function Http2RawPeer (req, onError) {
  
  stream.Readable.call(this);

  this._read = function () {
    if(!(req.body && req.body.entry && req.body.signature)){
      onError('Requires a peering entry + signature');
    }
    else {
      this.push(req.body.entry + req.body.signature);
    }
    this.push(null);
  }
}

function Http2RawForward (req, onError) {
  
  stream.Readable.call(this);

  this._read = function () {
    if(!(req.body && req.body.forward && req.body.signature)){
      onError('Requires a forward + signature');
    }
    else {
      this.push(req.body.forward + req.body.signature);
    }
    this.push(null);
  }
}

function Http2RawStatus (req, onError) {
  
  stream.Readable.call(this);

  this._read = function () {
    if(!(req.body && req.body.status && req.body.signature)){
      onError('Requires a status + signature');
    }
    else {
      this.push(req.body.status + req.body.signature);
    }
    this.push(null);
  }
}

function Http2RawWallet (req, onError) {
  
  stream.Readable.call(this);

  this._read = function () {
    if(!(req.body && req.body.entry && req.body.signature)){
      onError('Requires a wallet + signature');
    }
    else {
      this.push(req.body.entry + req.body.signature);
    }
    this.push(null);
  }
}

function Http2RawMembership (req, onError) {
  
  stream.Readable.call(this);

  this._read = function () {
    if(!(req.body && req.body.membership && req.body.signature)){
      onError('Requires a membership + signature');
    }
    else {
      this.push(req.body.membership + req.body.signature);
    }
    this.push(null);
  }
}

util.inherits(Http2RawPubkey,      stream.Readable);
util.inherits(Http2RawTransaction, stream.Readable);
util.inherits(Http2RawPeer,        stream.Readable);
util.inherits(Http2RawForward,     stream.Readable);
util.inherits(Http2RawStatus,      stream.Readable);
util.inherits(Http2RawWallet,      stream.Readable);
util.inherits(Http2RawMembership,  stream.Readable);
