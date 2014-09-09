var stream = require('stream');
var util   = require('util');

module.exports = {
  identity:      instanciate.bind(null, Http2RawIdentity),
  transaction:   instanciate.bind(null, Http2RawTransaction),
  peer:          instanciate.bind(null, Http2RawPeer),
  forward:       instanciate.bind(null, Http2RawForward),
  status:        instanciate.bind(null, Http2RawStatus),
  wallet:        instanciate.bind(null, Http2RawWallet),
  membership:    instanciate.bind(null, Http2RawMembership),
  keyblock:      instanciate.bind(null, Http2RawKeyblock),
};

function instanciate (constructorFunc, req, onError) {
  return new constructorFunc(req, onError);
};

function Http2RawIdentity (req, onError) {
  
  stream.Readable.call(this);

  this._read = function () {
    if(!req.body || !req.body.pubkey){
      onError('Parameter `pubkey` is required');
    }
    else if(!req.body || !req.body.self){
      onError('Parameter `self` is required');
    }
    else {
      var raw = req.body.pubkey + '\n' + req.body.self + (req.body.other ? '\n' + req.body.other : '');
      console.log(raw);
      this.push(raw);
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

function Http2RawKeyblock (req, onError) {
  
  stream.Readable.call(this);

  this._read = function () {
    if(!(req.body && req.body.keyblock && req.body.signature)){
      onError('Requires a keyblock + signature');
    }
    else {
      this.push(req.body.keyblock + req.body.signature);
    }
    this.push(null);
  }
}

util.inherits(Http2RawIdentity,    stream.Readable);
util.inherits(Http2RawTransaction, stream.Readable);
util.inherits(Http2RawPeer,        stream.Readable);
util.inherits(Http2RawForward,     stream.Readable);
util.inherits(Http2RawStatus,      stream.Readable);
util.inherits(Http2RawWallet,      stream.Readable);
util.inherits(Http2RawMembership,  stream.Readable);
util.inherits(Http2RawKeyblock,    stream.Readable);
