"use strict";

module.exports = {
  parseIdentity:    (new (require('./identity'))),
  parseCertification:(new (require('./certification'))),
  parseRevocation:  (new (require('./revocation'))),
  parseTransaction: (new (require('./transaction'))),
  parsePeer:        (new (require('./peer'))),
  parseMembership:  (new (require('./membership'))),
  parseBlock:       (new (require('./block')))
};
