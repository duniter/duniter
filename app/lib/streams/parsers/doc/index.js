module.exports = {
  parseAmendment: instanciate.bind(instanciate, require('./amendment')),
  parseVote:      instanciate.bind(instanciate, require('./vote'))
};

function instanciate (constructorFunc, onError) {
  return new constructorFunc(onError);
};
