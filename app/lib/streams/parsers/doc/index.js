module.exports = {
  parseIdentity:    instanciate.bind(instanciate, require('./identity')),
  parseCompactTX:   instanciate.bind(instanciate, require('./compacttx')),
  parseTransaction: instanciate.bind(instanciate, require('./transaction')),
  parsePeer:        instanciate.bind(instanciate, require('./peer')),
  parseForward:     instanciate.bind(instanciate, require('./forward')),
  parseStatus:      instanciate.bind(instanciate, require('./status')),
  parseWallet:      instanciate.bind(instanciate, require('./wallet')),
  parseMembership:  instanciate.bind(instanciate, require('./membership')),
  parseBlock:       instanciate.bind(instanciate, require('./block')),
};

function instanciate (constructorFunc, onError) {
  return new constructorFunc(onError);
};
