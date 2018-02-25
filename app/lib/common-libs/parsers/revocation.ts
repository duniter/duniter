import {CommonConstants} from "../../../lib/common-libs/constants"
import {GenericParser} from "./GenericParser"
import {hashf} from "../../../lib/common"
import {rawer} from "../../../lib/common-libs/index"

export class RevocationParser extends GenericParser {

  constructor() {
    super([
      {prop: "version",           regexp: CommonConstants.DOCUMENTS.DOC_VERSION },
      {prop: "type",              regexp: CommonConstants.REVOCATION.REVOC_TYPE },
      {prop: "currency",          regexp: CommonConstants.DOCUMENTS.DOC_CURRENCY },
      {prop: "issuer",            regexp: CommonConstants.DOCUMENTS.DOC_ISSUER },
      {prop: "sig",               regexp: CommonConstants.REVOCATION.IDTY_SIG },
      {prop: "buid",              regexp: CommonConstants.REVOCATION.IDTY_TIMESTAMP},
      {prop: "uid",               regexp: CommonConstants.REVOCATION.IDTY_UID }
    ], rawer.getOfficialRevocation)
  }

  _clean(obj:any) {
    obj.pubkey = obj.issuer;
    obj.revocation = obj.signature;
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
      return "No signature found for identity";
    }
    if (!obj.revocation) {
      return "No revocation signature found";
    }
    return ""
  }
}