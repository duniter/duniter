"use strict";
import {Contacter} from "./contacter"
import {Server} from "../../../../server"

const rawer = require('duniter-common').rawer;
const parsers = require('duniter-common').parsers;

export const pullSandbox = async (currency:string, fromHost:string, fromPort:number, toHost:string, toPort:number, logger:any) => {
  const from = new Contacter(fromHost, fromPort);
  const to = new Contacter(toHost, toPort);

  let res
  try {
    res = await from.getRequirementsPending(1)
  } catch (e) {
    // Silent error
    logger && logger.trace('Sandbox pulling: could not fetch requirements on %s', [fromHost, fromPort].join(':'))
  }

  if (res) {
    const docs = getDocumentsTree(currency, res)
    for (const identity of docs.identities) {
      await submitIdentity(identity, to)
    }
    for (const certification of docs.certifications) {
      await submitCertification(certification, to)
    }
    for (const membership of docs.memberships) {
      await submitMembership(membership, to)
    }
  }
}

export const pullSandboxToLocalServer = async (currency:string, fromHost:any, toServer:Server, logger:any, watcher:any = null, nbCertsMin = 1) => {
  let res
  try {
    res = await fromHost.getRequirementsPending(nbCertsMin || 1)
  } catch (e) {
    watcher && watcher.writeStatus('Sandbox pulling: could not fetch requirements on %s', [fromHost.host, fromHost.port].join(':'))
  }

  if (res) {
    const docs = getDocumentsTree(currency, res)

    for (let i = 0; i < docs.identities.length; i++) {
      const idty = docs.identities[i];
      watcher && watcher.writeStatus('Identity ' + (i+1) + '/' + docs.identities.length)
      await submitIdentityToServer(idty, toServer, logger)
    }

    for (let i = 0; i < docs.certifications.length; i++) {
      const cert = docs.certifications[i];
      watcher && watcher.writeStatus('Certification ' + (i+1) + '/' + docs.certifications.length)
      await submitCertificationToServer(cert, toServer, logger)
    }

    for (let i = 0; i < docs.memberships.length; i++) {
      const ms = docs.memberships[i];
      watcher && watcher.writeStatus('Membership ' + (i+1) + '/' + docs.memberships.length)
      await submitMembershipToServer(ms, toServer, logger)
    }
  }
}

function getDocumentsTree(currency:string, res:any) {
  const documents:any = {
    identities: [],
    certifications: [],
    memberships: []
  }
  for(const idty of res.identities) {
    const identity = rawer.getOfficialIdentity({
      currency,
      uid:      idty.uid,
      pubkey:   idty.pubkey,
      buid:     idty.meta.timestamp,
      sig:      idty.sig
    })
    documents.identities.push(identity)
    for (const cert of idty.pendingCerts) {
      const certification = rawer.getOfficialCertification({
        currency,
        idty_issuer: idty.pubkey,
        idty_uid:    idty.uid,
        idty_buid:   idty.meta.timestamp,
        idty_sig:    idty.sig,
        issuer:      cert.from,
        buid:        cert.blockstamp,
        sig:         cert.sig
      })
      documents.certifications.push(certification)
    }
    for (const ms of idty.pendingMemberships) {
      const membership = rawer.getMembership({
        currency,
        userid:     idty.uid,
        issuer:     idty.pubkey,
        certts:     idty.meta.timestamp,
        membership: ms.type,
        block:      ms.blockstamp,
        signature:  ms.sig
      })
      documents.memberships.push(membership)
    }
  }
  return documents
}

async function submitIdentity(idty:any, to:any, logger:any = null) {
  try {
    await to.postIdentity(idty)
    logger && logger.trace('Sandbox pulling: success with identity \'%s\'', idty.uid)
  } catch (e) {
    // Silent error
  }
}

async function submitCertification(cert:any, to:any, logger:any = null) {
  try {
    await to.postCert(cert)
    logger && logger.trace('Sandbox pulling: success with cert key %s => %s', cert.from.substr(0, 6), cert.idty_uid)
  } catch (e) {
    // Silent error
  }
}

async function submitMembership(ms:any, to:any, logger:any = null) {
  try {
    await to.postRenew(ms)
    logger && logger.trace('Sandbox pulling: success with membership \'%s\'', ms.uid)
  } catch (e) {
    // Silent error
  }
}

async function submitIdentityToServer(idty:any, toServer:any, logger:any = null) {
  try {
    const obj = parsers.parseIdentity.syncWrite(idty)
    obj.documentType = 'identity'
    await toServer.singleWritePromise(obj)
    logger && logger.trace('Sandbox pulling: success with identity \'%s\'', idty.uid)
  } catch (e) {
    // Silent error
  }
}

async function submitCertificationToServer(cert:any, toServer:any, logger:any = null) {
  try {
    const obj = parsers.parseCertification.syncWrite(cert)
    obj.documentType = 'certification'
    await toServer.singleWritePromise(obj)
    logger && logger.trace('Sandbox pulling: success with cert key %s => %s', cert.from.substr(0, 6), cert.idty_uid)
  } catch (e) {
    // Silent error
  }
}

async function submitMembershipToServer(ms:any, toServer:any, logger:any = null) {
  try {
    const obj = parsers.parseMembership.syncWrite(ms)
    obj.documentType = 'membership'
    await toServer.singleWritePromise(obj)
    logger && logger.trace('Sandbox pulling: success with membership \'%s\'', ms.uid)
  } catch (e) {
    // Silent error
  }
}
