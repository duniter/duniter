// Source file from duniter: Crypto-currency software to manage libre currency such as Ğ1
// Copyright (C) 2018  Cedric Moreau <cem.moreau@gmail.com>
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.

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
