"use strict";

const constants = require('../constants');

module.exports = {
  identity:      requiresParameter('identity',    constants.ERRORS.HTTP_PARAM_IDENTITY_REQUIRED),
  certification: requiresParameter('cert',        constants.ERRORS.HTTP_PARAM_CERT_REQUIRED),
  revocation:    requiresParameter('revocation',  constants.ERRORS.HTTP_PARAM_REVOCATION_REQUIRED),
  transaction:   requiresParameter('transaction', constants.ERRORS.HTTP_PARAM_TX_REQUIRED),
  peer:          requiresParameter('peer',        constants.ERRORS.HTTP_PARAM_PEER_REQUIRED),
  membership:    Http2RawMembership,
  block:         requiresParameter('block',       constants.ERRORS.HTTP_PARAM_BLOCK_REQUIRED),
  conf:          requiresParameter('conf',        constants.ERRORS.HTTP_PARAM_CONF_REQUIRED),
  cpu:           requiresParameter('cpu',         constants.ERRORS.HTTP_PARAM_CPU_REQUIRED)
};

function requiresParameter(parameter, err) {
  return (req) => {
    if(!req.body || req.body[parameter] === undefined){
      throw err;
    }
    return req.body[parameter];
  };
}

function Http2RawMembership (req) {
  if(!(req.body && req.body.membership)){
    throw constants.ERRORS.HTTP_PARAM_MEMBERSHIP_REQUIRED;
  }
  let ms = req.body.membership;
  if(req.body && req.body.signature){
    ms = [ms, req.body.signature].join('');
    if (!ms.match(/\n$/)) {
      ms += '\n';
    }
  }
  return ms;
}
