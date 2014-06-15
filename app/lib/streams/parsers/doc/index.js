module.exports = {
  parseAmendment:   instanciate.bind(instanciate, require('./amendment')),
  parseVote:        instanciate.bind(instanciate, require('./vote')),
  parsePubkey:      instanciate.bind(instanciate, require('./pubkey')),
  parseTransaction: instanciate.bind(instanciate, require('./transaction')),
  parsePeer:        instanciate.bind(instanciate, require('./peer')),
  parseForward:     instanciate.bind(instanciate, require('./forward')),
  parseStatus:      instanciate.bind(instanciate, require('./status')),
  parseWallet:      instanciate.bind(instanciate, require('./wallet')),
  parseMembership:  instanciate.bind(instanciate, require('./membership')),
  parseVoting:      instanciate.bind(instanciate, require('./voting')),
};

function instanciate (constructorFunc, onError) {
  return new constructorFunc(onError);
};
