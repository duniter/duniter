"use strict";

module.exports = {
  parseIdentity:    instanciate.bind(instanciate, require('./identity')),
  parseRevocation:  instanciate.bind(instanciate, require('./revocation')),
  parseTransaction: instanciate.bind(instanciate, require('./transaction')),
  parsePeer:        instanciate.bind(instanciate, require('./peer')),
  parseStatus:      instanciate.bind(instanciate, require('./status')),
  parseMembership:  instanciate.bind(instanciate, require('./membership')),
  parseBlock:       instanciate.bind(instanciate, require('./block')),
};

function instanciate (constructorFunc, onError) {
  return new constructorFunc(onError);
};
