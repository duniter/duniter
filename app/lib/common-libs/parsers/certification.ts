import {CommonConstants} from "../../../lib/common-libs/constants"
import {GenericParser} from "./GenericParser"
import {rawer} from "../../../lib/common-libs/index"

export class CertificationParser extends GenericParser {

  constructor() {
    super([
      {prop: "version",           regexp: CommonConstants.DOCUMENTS.DOC_VERSION },
      {prop: "type",              regexp: CommonConstants.CERTIFICATION.CERT_TYPE },
      {prop: "currency",          regexp: CommonConstants.DOCUMENTS.DOC_CURRENCY },
      {prop: "issuer",            regexp: CommonConstants.DOCUMENTS.DOC_ISSUER },
      {prop: "idty_issuer",       regexp: CommonConstants.CERTIFICATION.IDTY_ISSUER },
      {prop: "idty_sig",          regexp: CommonConstants.CERTIFICATION.IDTY_SIG },
      {prop: "idty_buid",         regexp: CommonConstants.CERTIFICATION.IDTY_TIMESTAMP},
      {prop: "idty_uid",          regexp: CommonConstants.CERTIFICATION.IDTY_UID },
      {prop: "buid",              regexp: CommonConstants.CERTIFICATION.CERT_TIMESTAMP }
    ], rawer.getOfficialCertification)
  }

  _clean(obj:any) {
    obj.sig = obj.signature;
    obj.block = obj.buid;
    if (obj.block) {
      obj.number = obj.block.split('-')[0];
      obj.fpr = obj.block.split('-')[1];
    } else {
      obj.number = '0';
      obj.fpr = '';
    }
  }

  _verify(obj:any): string {
    return ["version", "type", "currency", "issuer", "idty_issuer", "idty_sig", "idty_buid", "idty_uid", "block"].reduce((p, field) => {
      return p || (!obj[field] && "Wrong format for certification") || ""
    }, "")
  }
}