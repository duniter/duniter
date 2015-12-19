"use strict";

module.exports = {
  parseIdentity:    (new (require('./identity'))),
  parseRevocation:  (new (require('./revocation'))),
  parseTransaction: instanciate.bind(instanciate, require('./transaction')),
  parsePeer:        (new (require('./peer'))),
  parseMembership:  instanciate.bind(instanciate, require('./membership')),
  parseBlock:       instanciate.bind(instanciate, require('./block'))
};

function instanciate (constructorFunc, onError) {
  return new constructorFunc(onError);
}
