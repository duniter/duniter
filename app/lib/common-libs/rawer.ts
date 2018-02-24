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

import {dos2unix} from "./dos2unix"
import {PeerDTO} from "../dto/PeerDTO"
import {IdentityDTO} from "../dto/IdentityDTO"
import {MembershipDTO} from "../dto/MembershipDTO"
import {TransactionDTO} from "../dto/TransactionDTO"
import {BlockDTO} from "../dto/BlockDTO"

const DOCUMENTS_VERSION = 10;
const SIGNED = false
const UNSIGNED = true

export const getOfficialIdentity = (json:any, withSig = true) => {
  const dto = IdentityDTO.fromJSONObject(json)
  if (withSig !== false) {
    return dto.getRawSigned()
  } else {
    return dto.rawWithoutSig()
  }
}

export const getOfficialCertification = (json:any) => {
  let raw = getNormalHeader('Certification', json);
  raw += "IdtyIssuer: " + json.idty_issuer + '\n';
  raw += "IdtyUniqueID: " + json.idty_uid + '\n';
  raw += "IdtyTimestamp: " + json.idty_buid + '\n';
  raw += "IdtySignature: " + json.idty_sig + '\n';
  raw += "CertTimestamp: " + json.buid + '\n';
  if (json.sig) {
    raw += json.sig + '\n';
  }
  return dos2unix(raw);
}

export const getOfficialRevocation = (json:any) => {
  let raw = getNormalHeader('Revocation', json);
  raw += "IdtyUniqueID: " + json.uid + '\n';
  raw += "IdtyTimestamp: " + json.buid + '\n';
  raw += "IdtySignature: " + json.sig + '\n';
  if (json.revocation) {
    raw += json.revocation + '\n';
  }
  return dos2unix(raw);
}

export const getPeerWithoutSignature = (json:any) => {
  return PeerDTO.fromJSONObject(json).getRawUnsigned()
}

export const getPeer = (json:any) => {
  return PeerDTO.fromJSONObject(json).getRawSigned()
}

export const getMembershipWithoutSignature = (json:any) => {
  return MembershipDTO.fromJSONObject(json).getRaw()
}

export const getMembership = (json:any) => {
  return dos2unix(signed(getMembershipWithoutSignature(json), json));
}

export const getBlockInnerPart = (json:any) => {
  return BlockDTO.fromJSONObject(json).getRawInnerPart()
}

export const getBlockWithInnerHashAndNonce = (json:any) => {
  return BlockDTO.fromJSONObject(json).getRawUnSigned()
}

export const getBlockInnerHashAndNonceWithSignature = (json:any) => {
  return BlockDTO.fromJSONObject(json).getSignedPartSigned()
}

export const getBlock = (json:any) => {
  return dos2unix(signed(getBlockWithInnerHashAndNonce(json), json));
}

export const getTransaction = (json:any) => {
  return TransactionDTO.toRAW(json)
}

function getNormalHeader(doctype:string, json:any) {
  let raw = "";
  raw += "Version: " + (json.version || DOCUMENTS_VERSION) + "\n";
  raw += "Type: " + doctype + "\n";
  raw += "Currency: " + json.currency + "\n";
  raw += "Issuer: " + json.issuer + "\n";
  return raw;
}

function signed(raw:string, json:any) {
  raw += json.signature + '\n';
  return raw;
}
