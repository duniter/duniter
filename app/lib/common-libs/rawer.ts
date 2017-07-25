import {dos2unix} from "./dos2unix"
import {PeerDTO} from "../dto/PeerDTO"
import {IdentityDTO} from "../dto/IdentityDTO"
import {MembershipDTO} from "../dto/MembershipDTO"

const DOCUMENTS_VERSION = 10;
const SIGNED = false
const UNSIGNED = true

function document() {
  return require('../../common/lib/document')
}

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
  return document().Block.toRAWInnerPart(json)
}

export const getBlockWithInnerHashAndNonce = (json:any) => {
  return document().Block.toRAWinnerPartWithHashAndNonce(json)
}

export const getBlockInnerHashAndNonce = (json:any) => {
  return document().Block.toRAWHashAndNonce(json, UNSIGNED)
}

export const getBlockInnerHashAndNonceWithSignature = (json:any) => {
  return document().Block.toRAWHashAndNonce(json, SIGNED)
}

export const getBlock = (json:any) => {
  return dos2unix(signed(getBlockWithInnerHashAndNonce(json), json));
}

export const getTransaction = (json:any) => {
  return document().Transaction.toRAW(json)
}

export const getCompactTransaction = (json:any) => {
  return document().Transaction.getCompactTransaction(json)
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
