"use strict";

var constants = require('../../constants');

module.exports = {
  identity:      Http2RawIdentity,
  revocation:    Http2RawRevocation,
  transaction:   Http2RawTransaction,
  peer:          Http2RawPeer,
  membership:    Http2RawMembership,
  block:         Http2RawBlock
};

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

function Http2RawRevocation (req) {
  if(!req.body || !req.body.pubkey){
    throw constants.ERRORS.HTTP_PARAM_PUBKEY_REQUIRED;
  }
  else if(!req.body || !req.body.self){
    throw constants.ERRORS.HTTP_PARAM_SELF_REQUIRED;
  }
  else if(!req.body || !req.body.sig){
    throw constants.ERRORS.HTTP_PARAM_SIG_REQUIRED;
  }
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
  return pubkey + selfCert + revocationLine + (req.body.sig || '');
}

function Http2RawTransaction (req) {
  if(!(req.body && req.body.transaction)){
    throw constants.ERRORS.HTTP_PARAM_TX_REQUIRED;
  }
  return req.body.transaction;
}

function Http2RawPeer (req) {
  if(!(req.body && req.body.peer)){
    throw constants.ERRORS.HTTP_PARAM_PEER_REQUIRED;
  }
  return req.body.peer;
}

function Http2RawMembership (req) {
  if(!(req.body && req.body.membership)){
    throw constants.ERRORS.HTTP_PARAM_MEMBERSHIP_REQUIRED;
  }
  return req.body.membership;
}

function Http2RawBlock (req) {
  if(!(req.body && req.body.block)){
    throw constants.ERRORS.HTTP_PARAM_BLOCK_REQUIRED;
  }
  return req.body.block;
}
