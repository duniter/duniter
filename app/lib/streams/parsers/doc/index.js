module.exports = {
  parseIdentity:    instanciate.bind(instanciate, require('./identity')),
  parseTransaction: instanciate.bind(instanciate, require('./transaction')),
  parsePeer:        instanciate.bind(instanciate, require('./peer')),
  parseForward:     instanciate.bind(instanciate, require('./forward')),
  parseStatus:      instanciate.bind(instanciate, require('./status')),
  parseWallet:      instanciate.bind(instanciate, require('./wallet')),
  parseMembership:  instanciate.bind(instanciate, require('./membership')),
  parseKeyblock:    instanciate.bind(instanciate, require('./keyblock')),
  parseKeychange:   instanciate.bind(instanciate, require('./keychange')),
};

function instanciate (constructorFunc, onError) {
  return new constructorFunc(onError);
};
