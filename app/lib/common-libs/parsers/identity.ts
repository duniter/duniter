import {GenericParser} from "./GenericParser"
import {CommonConstants} from "../../../lib/common-libs/constants"
import {hashf} from "../../../lib/common"
import {rawer} from "../../../lib/common-libs/index"

export class IdentityParser extends GenericParser {

  constructor() {
    super([
      {prop: "version",           regexp: CommonConstants.DOCUMENTS.DOC_VERSION },
      {prop: "type",              regexp: CommonConstants.IDENTITY.IDTY_TYPE},
      {prop: "currency",          regexp: CommonConstants.DOCUMENTS.DOC_CURRENCY },
      {prop: "pubkey",            regexp: CommonConstants.DOCUMENTS.DOC_ISSUER },
      {prop: "uid",               regexp: CommonConstants.IDENTITY.IDTY_UID },
      {prop: "buid",              regexp: CommonConstants.DOCUMENTS.TIMESTAMP }
    ], rawer.getOfficialIdentity)
  }

  _clean(obj:any) {
    obj.documentType = 'identity';
    obj.sig = obj.signature;
    if (obj.uid && obj.buid && obj.pubkey) {
      obj.hash = hashf(obj.uid + obj.buid + obj.pubkey).toUpperCase();
    }
  }

  _verify(obj:any) {
    if (!obj.pubkey) {
      return "No pubkey found";
    }
    if (!obj.uid) {
      return "Wrong user id format";
    }
    if (!obj.buid) {
      return "Could not extract block uid";
    }
    if (!obj.sig) {
      return "No signature found for self-certification";
    }
    return ""
  }
}
