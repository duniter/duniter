module.exports = {
  parseAmendment: instanciate.bind(instanciate, require('./amendment')),
  parseVote:      instanciate.bind(instanciate, require('./vote')),
  parsePubkey:    instanciate.bind(instanciate, require('./pubkey')),
};

function instanciate (constructorFunc, onError) {
  return new constructorFunc(onError);
};
