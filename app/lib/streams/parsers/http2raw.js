var stream = require('stream');
var util   = require('util');

module.exports = {
  identity:      instanciate.bind(null, Http2RawIdentity),
  transaction:   instanciate.bind(null, Http2RawTransaction),
  peer:          instanciate.bind(null, Http2RawPeer),
  status:        instanciate.bind(null, Http2RawStatus),
  membership:    instanciate.bind(null, Http2RawMembership),
  block:         instanciate.bind(null, Http2RawBlock),
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
      this.push(raw);
    }
    this.push(null);
  }
}

function Http2RawTransaction (req, onError) {
  
  stream.Readable.call(this);

  this._read = function () {
    if(!(req.body && req.body.transaction)){
      onError('Requires a transaction');
    }
    else {
      this.push(req.body.transaction);
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
      this.push(req.body.entry + req.body.signature + (req.body.signature.match(/\n$/) ? '' : '\n'));
    }
    this.push(null);
  }
}

function Http2RawStatus (req, onError) {
  
  stream.Readable.call(this);

  this._read = function () {
    if(!(req.body && req.body.status)){
      onError('Requires a status');
    }
    else {
      this.push(req.body.status);
    }
    this.push(null);
  }
}

function Http2RawMembership (req, onError) {
  
  stream.Readable.call(this);

  this._read = function () {
    if(!(req.body && req.body.membership)){
      onError('Requires a membership');
    }
    else {
      this.push(req.body.membership);
    }
    this.push(null);
  }
}

function Http2RawBlock (req, onError) {
  
  stream.Readable.call(this);

  this._read = function () {
    if(!(req.body && req.body.block)){
      onError('Requires a block');
    }
    else {
      this.push(req.body.block);
    }
    this.push(null);
  }
}

util.inherits(Http2RawIdentity,    stream.Readable);
util.inherits(Http2RawTransaction, stream.Readable);
util.inherits(Http2RawPeer,        stream.Readable);
util.inherits(Http2RawStatus,      stream.Readable);
util.inherits(Http2RawMembership,  stream.Readable);
util.inherits(Http2RawBlock,       stream.Readable);
