import {BMAConstants} from "./constants"

module.exports = {
  identity:      requiresParameter('identity',    BMAConstants.ERRORS.HTTP_PARAM_IDENTITY_REQUIRED),
  certification: requiresParameter('cert',        BMAConstants.ERRORS.HTTP_PARAM_CERT_REQUIRED),
  revocation:    requiresParameter('revocation',  BMAConstants.ERRORS.HTTP_PARAM_REVOCATION_REQUIRED),
  transaction:   requiresParameter('transaction', BMAConstants.ERRORS.HTTP_PARAM_TX_REQUIRED),
  peer:          requiresParameter('peer',        BMAConstants.ERRORS.HTTP_PARAM_PEER_REQUIRED),
  membership:    Http2RawMembership,
  block:         requiresParameter('block',       BMAConstants.ERRORS.HTTP_PARAM_BLOCK_REQUIRED),
  conf:          requiresParameter('conf',        BMAConstants.ERRORS.HTTP_PARAM_CONF_REQUIRED),
  cpu:           requiresParameter('cpu',         BMAConstants.ERRORS.HTTP_PARAM_CPU_REQUIRED)
};

function requiresParameter(parameter:string, err:any) {
  return (req:any) => {
    if(!req.body || req.body[parameter] === undefined){
      throw err;
    }
    return req.body[parameter];
  };
}

function Http2RawMembership (req:any) {
  if(!(req.body && req.body.membership)){
    throw BMAConstants.ERRORS.HTTP_PARAM_MEMBERSHIP_REQUIRED;
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
