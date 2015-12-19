"use strict";

var stream = require('stream');
var util   = require('util');
var constants = require('../../constants');

module.exports = {
  identity:      Http2RawIdentity,
  revocation:    Http2RawRevocation,
  transaction:   instanciate.bind(null, Http2RawTransaction),
  peer:          Http2RawPeer,
  membership:    instanciate.bind(null, Http2RawMembership),
  block:         instanciate.bind(null, Http2RawBlock)
};

function instanciate (constructorFunc, req, onError) {
  return new constructorFunc(req, onError);
}

function Http2RawIdentity (req) {
  if(!req.body || !req.body.pubkey){
    throw constants.ERRORS.HTTP_PARAM_PUBKEY_REQUIRED;
  }
  if(!req.body || !req.body.self){
    throw constants.ERRORS.HTTP_PARAM_SELF_REQUIRED;
  }
  let pubkey = req.body.pubkey;
  // Add trailing LF to pubkey
  if (!req.body.pubkey.match(/\n$/)) {
    pubkey += '\n';
  }
  let selfCert = req.body.self;
  // Add trailing LF to self
  if (!req.body.self.match(/\n$/)) {
    selfCert += '\n';
  }
  return pubkey + selfCert + (req.body.other || '');
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

function Http2RawPeer (req) {
  if(!(req.body && req.body.peer)){
    throw constants.ERRORS.HTTP_PARAM_PEER_REQUIRED;
  }
  return req.body.peer;
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
util.inherits(Http2RawMembership,  stream.Readable);
util.inherits(Http2RawBlock,       stream.Readable);
