import {CommonConstants} from "../../../lib/common-libs/constants"
import {GenericParser} from "./GenericParser"
import {rawer} from "../../../lib/common-libs/index"
import {Buid} from "../../../lib/common-libs/buid"

export class MembershipParser extends GenericParser {

  constructor() {
    super([
      {prop: "version",           regexp: CommonConstants.MEMBERSHIP.VERSION },
      {prop: "currency",          regexp: CommonConstants.MEMBERSHIP.CURRENCY },
      {prop: "issuer",            regexp: CommonConstants.MEMBERSHIP.ISSUER },
      {prop: "membership",        regexp: CommonConstants.MEMBERSHIP.MEMBERSHIP },
      {prop: "userid",            regexp: CommonConstants.MEMBERSHIP.USERID },
      {prop: "block",             regexp: CommonConstants.MEMBERSHIP.BLOCK},
      {prop: "certts",            regexp: CommonConstants.MEMBERSHIP.CERTTS}
    ], rawer.getMembership)
  }

  _clean(obj:any) {
    if (obj.block) {
      obj.number = obj.block.split('-')[0];
      obj.fpr = obj.block.split('-')[1];
    } else {
      obj.number = '0';
      obj.fpr = '';
    }
  }

  _verify(obj:any) {
    let err = null;
    const codes = {
      'BAD_VERSION': 150,
      'BAD_CURRENCY': 151,
      'BAD_ISSUER': 152,
      'BAD_MEMBERSHIP': 153,
      'BAD_REGISTRY_TYPE': 154,
      'BAD_BLOCK': 155,
      'BAD_USERID': 156,
      'BAD_CERTTS': 157
    };
    if(!err){
      if(!obj.version || !obj.version.match(CommonConstants.DOCUMENTS_VERSION_REGEXP))
        err = {code: codes.BAD_VERSION, message: "Version unknown"};
    }
    if(!err){
      if(obj.issuer && !obj.issuer.match(CommonConstants.BASE58))
        err = {code: codes.BAD_ISSUER, message: "Incorrect issuer field"};
    }
    if(!err){
      if(!(obj.membership || "").match(/^(IN|OUT)$/))
        err = {code: codes.BAD_MEMBERSHIP, message: "Incorrect Membership field: must be either IN or OUT"};
    }
    if(!err){
      if(obj.block && !obj.block.match(CommonConstants.BLOCK_UID))
        err = {code: codes.BAD_BLOCK, message: "Incorrect Block field: must be a positive or zero integer, a dash and an uppercased SHA1 hash"};
    }
    if(!err){
      if(obj.userid && !obj.userid.match(CommonConstants.USER_ID))
        err = {code: codes.BAD_USERID, message: "UserID must match udid2 format"};
    }
    if(!err){
      if(!Buid.format.isBuid(obj.certts))
        err = {code: codes.BAD_CERTTS, message: "CertTS must be a valid timestamp"};
    }
    return err && err.message;
  };
}