var stream = require('stream');
var util   = require('util');

module.exports = {
  identity:      instanciate.bind(null, Http2RawIdentity),
  revocation:    instanciate.bind(null, Http2RawRevocation),
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
      var pubkey = req.body.pubkey;
      // Add trailing LF to pubkey
      if (!req.body.pubkey.match(/\n$/)) {
        pubkey += '\n';
      }
      var selfCert = req.body.self;
      // Add trailing LF to self
      if (!req.body.self.match(/\n$/)) {
        selfCert += '\n';
      }
      var raw = pubkey + selfCert + (req.body.other || '');
      this.push(raw);
    }
    this.push(null);
  }
}

function Http2RawRevocation (req, onError) {
  
  stream.Readable.call(this);

  this._read = function () {
    if(!req.body || !req.body.pubkey){
      onError('Parameter `pubkey` is required');
    }
    else if(!req.body || !req.body.self){
      onError('Parameter `self` is required');
    }
    else if(!req.body || !req.body.sig){
      onError('Parameter `sig` is required');
    }
    else {
      var pubkey = req.body.pubkey;
      // Add trailing LF to pubkey
      if (!req.body.pubkey.match(/\n$/)) {
        pubkey += '\n';
      }
      var selfCert = req.body.self;
      // Add trailing LF to self
      if (!req.body.self.match(/\n$/)) {
        selfCert += '\n';
      }
      var revocationLine = 'META:REVOKE\n';
      var raw = pubkey + selfCert + revocationLine + (req.body.sig || '');
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
    if(!(req.body && req.body.peer)){
      onError('Requires a peer');
    }
    else {
      this.push(req.body.peer);
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
util.inherits(Http2RawRevocation,  stream.Readable);
util.inherits(Http2RawTransaction, stream.Readable);
util.inherits(Http2RawPeer,        stream.Readable);
util.inherits(Http2RawStatus,      stream.Readable);
util.inherits(Http2RawMembership,  stream.Readable);
util.inherits(Http2RawBlock,       stream.Readable);
