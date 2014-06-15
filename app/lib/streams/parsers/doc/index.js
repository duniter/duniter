module.exports = {
  parseAmendment:   instanciate.bind(instanciate, require('./amendment')),
  parseVote:        instanciate.bind(instanciate, require('./vote')),
  parsePubkey:      instanciate.bind(instanciate, require('./pubkey')),
  parseTransaction: instanciate.bind(instanciate, require('./transaction')),
  parsePeer:        instanciate.bind(instanciate, require('./peer')),
  parseForward:     instanciate.bind(instanciate, require('./forward')),
};

function instanciate (constructorFunc, onError) {
  return new constructorFunc(onError);
};
