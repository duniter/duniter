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

"use strict";
import { Server } from "../../../../server";
import { rawer } from "../../../lib/common-libs/index";
import { parsers } from "../../../lib/common-libs/parsers/index";
import { IRemoteContacter } from "./sync/IRemoteContacter";
import { HttpRequirements } from "../../bma/lib/dtos";
import { Watcher } from "./sync/Watcher";
import { PeerDTO } from "../../../lib/dto/PeerDTO";
import { connect } from "./connect";

export const pullSandboxToLocalServer = async (
  currency: string,
  fromHost: IRemoteContacter,
  toServer: Server,
  logger: any,
  watcher: any = null,
  nbCertsMin = 1,
  notify = true
) => {
  let res;
  try {
    res = await fromHost.getRequirementsPending(nbCertsMin || 1);
  } catch (e) {
    watcher &&
      watcher.writeStatus(
        "Sandbox pulling: could not fetch requirements on %s",
        fromHost.getName()
      );
  }

  if (res) {
    await applyMempoolRequirements(currency, res, toServer);
  }
};

export async function applyMempoolRequirements(
  currency: string,
  res: HttpRequirements,
  toServer: Server,
  notify = true,
  logger?: any,
  watcher?: Watcher
) {
  const docs = getDocumentsTree(currency, res);

  let t = 0;
  let T =
    docs.identities.length +
    docs.certifications.length +
    docs.revocations.length +
    docs.memberships.length;

  for (let i = 0; i < docs.identities.length; i++) {
    const idty = docs.identities[i];
    watcher &&
      watcher.writeStatus("Identity " + (i + 1) + "/" + docs.identities.length);
    watcher && watcher.sbxPercent((t++ / T) * 100);
    await submitIdentityToServer(idty, toServer, notify, logger);
  }

  for (let i = 0; i < docs.revocations.length; i++) {
    const idty = docs.revocations[i];
    watcher &&
      watcher.writeStatus(
        "Revocation " + (i + 1) + "/" + docs.revocations.length
      );
    watcher && watcher.sbxPercent((t++ / T) * 100);
    await submitRevocationToServer(idty, toServer, notify, logger);
  }

  for (let i = 0; i < docs.certifications.length; i++) {
    const cert = docs.certifications[i];
    watcher &&
      watcher.writeStatus(
        "Certification " + (i + 1) + "/" + docs.certifications.length
      );
    watcher && watcher.sbxPercent((t++ / T) * 100);
    await submitCertificationToServer(cert, toServer, notify, logger);
  }

  for (let i = 0; i < docs.memberships.length; i++) {
    const ms = docs.memberships[i];
    watcher &&
      watcher.writeStatus(
        "Membership " + (i + 1) + "/" + docs.memberships.length
      );
    watcher && watcher.sbxPercent((t++ / T) * 100);
    await submitMembershipToServer(ms, toServer, notify, logger);
  }

  watcher && watcher.sbxPercent(100);
}

export async function forwardToServer(
  currency: string,
  res: HttpRequirements,
  toHost: string,
  toPort: string,
  logger?: any,
  watcher?: Watcher
) {
  const docs = getDocumentsTree(currency, res);
  const [port, path] = toPort.split("/");
  let ep = [port == "443" ? "BMAS" : "BASIC_MERKLED_API", toHost, port].join(
    " "
  );
  if (path) {
    ep += " /" + path;
  }

  toPort = ":" + toPort;
  const peer = PeerDTO.fromJSONObject({ endpoints: [ep] });
  logger.info("Forwarded to %s...", toHost + toPort);
  const target = await connect(peer);

  let t = 0;
  let T =
    docs.identities.length +
    docs.certifications.length +
    docs.revocations.length +
    docs.memberships.length;

  for (let i = 0; i < docs.identities.length; i++) {
    const idty = docs.identities[i];
    watcher &&
      watcher.writeStatus("Identity " + (i + 1) + "/" + docs.identities.length);
    watcher && watcher.sbxPercent((t++ / T) * 100);
    try {
      await target.postIdentity(idty);
      logger.info("Forwarded identity to %s...", toHost + toPort);
    } catch (e) {
      logger.warn(e);
    }
  }

  for (let i = 0; i < docs.revocations.length; i++) {
    const revo = docs.revocations[i];
    watcher &&
      watcher.writeStatus(
        "Revocation " + (i + 1) + "/" + docs.revocations.length
      );
    watcher && watcher.sbxPercent((t++ / T) * 100);
    try {
      await target.postRevocation(revo);
      logger.info("Forwarded revocation to %s...", toHost + toPort);
    } catch (e) {
      logger.warn(e);
    }
  }

  for (let i = 0; i < docs.certifications.length; i++) {
    const cert = docs.certifications[i];
    watcher &&
      watcher.writeStatus(
        "Certification " + (i + 1) + "/" + docs.certifications.length
      );
    watcher && watcher.sbxPercent((t++ / T) * 100);
    try {
      await target.postCert(cert);
      logger.info("Forwarded cert to %s...", toHost + toPort);
    } catch (e) {
      logger.warn(e);
    }
  }

  for (let i = 0; i < docs.memberships.length; i++) {
    const ms = docs.memberships[i];
    watcher &&
      watcher.writeStatus(
        "Membership " + (i + 1) + "/" + docs.memberships.length
      );
    watcher && watcher.sbxPercent((t++ / T) * 100);
    try {
      await target.postRenew(ms);
      logger.info("Forwarded membership to %s...", toHost + toPort);
    } catch (e) {
      logger.warn(e);
    }
  }

  watcher && watcher.sbxPercent(100);
}

function getDocumentsTree(currency: string, res: HttpRequirements) {
  const documents: any = {
    identities: [],
    certifications: [],
    memberships: [],
    revocations: [],
  };
  for (const idty of res.identities) {
    const identity = rawer.getOfficialIdentity({
      currency,
      uid: idty.uid,
      pubkey: idty.pubkey,
      buid: idty.meta.timestamp,
      sig: idty.sig,
    });
    if (idty.revocation_sig) {
      const revocation = rawer.getOfficialRevocation({
        currency,
        uid: idty.uid,
        issuer: idty.pubkey,
        buid: idty.meta.timestamp,
        sig: idty.sig,
        revocation: idty.revocation_sig,
      });
      documents.revocations.push(revocation);
    }
    documents.identities.push(identity);
    for (const cert of idty.pendingCerts) {
      const certification = rawer.getOfficialCertification({
        currency,
        idty_issuer: idty.pubkey,
        idty_uid: idty.uid,
        idty_buid: idty.meta.timestamp,
        idty_sig: idty.sig,
        issuer: cert.from,
        buid: cert.blockstamp,
        sig: cert.sig,
      });
      documents.certifications.push(certification);
    }
    for (const ms of idty.pendingMemberships) {
      const membership = rawer.getMembership({
        currency,
        userid: idty.uid,
        issuer: idty.pubkey,
        certts: idty.meta.timestamp,
        membership: ms.type,
        block: ms.blockstamp,
        signature: ms.sig,
      });
      documents.memberships.push(membership);
    }
  }
  return documents;
}

async function submitIdentityToServer(
  idty: any,
  toServer: any,
  notify: boolean,
  logger: any
) {
  try {
    const obj = parsers.parseIdentity.syncWrite(idty);
    await toServer.writeIdentity(obj, notify);
    logger &&
      logger.trace("Sandbox pulling: success with identity '%s'", obj.uid);
  } catch (e) {
    // Silent error
  }
}

async function submitRevocationToServer(
  revocation: any,
  toServer: any,
  notify: boolean,
  logger: any
) {
  try {
    const obj = parsers.parseRevocation.syncWrite(revocation);
    await toServer.writeRevocation(obj, notify);
    logger &&
      logger.trace("Sandbox pulling: success with revocation '%s'", obj.uid);
  } catch (e) {
    // Silent error
  }
}

async function submitCertificationToServer(
  cert: any,
  toServer: any,
  notify: boolean,
  logger: any
) {
  try {
    const obj = parsers.parseCertification.syncWrite(cert);
    await toServer.writeCertification(obj, notify);
    logger &&
      logger.trace(
        "Sandbox pulling: success with cert key %s => %s",
        cert.from.substr(0, 6),
        cert.idty_uid
      );
  } catch (e) {
    // Silent error
  }
}

async function submitMembershipToServer(
  ms: any,
  toServer: any,
  notify: boolean,
  logger: any
) {
  try {
    const obj = parsers.parseMembership.syncWrite(ms);
    await toServer.writeMembership(obj, notify);
    logger &&
      logger.trace("Sandbox pulling: success with membership '%s'", ms.uid);
  } catch (e) {
    // Silent error
  }
}
