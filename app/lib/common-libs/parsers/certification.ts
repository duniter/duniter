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

import { CommonConstants } from "../../../lib/common-libs/constants";
import { GenericParser } from "./GenericParser";
import { rawer } from "../../../lib/common-libs/index";

export class CertificationParser extends GenericParser {
  constructor() {
    super(
      [
        { prop: "version", regexp: CommonConstants.DOCUMENTS.DOC_VERSION },
        { prop: "type", regexp: CommonConstants.CERTIFICATION.CERT_TYPE },
        { prop: "currency", regexp: CommonConstants.DOCUMENTS.DOC_CURRENCY },
        { prop: "issuer", regexp: CommonConstants.DOCUMENTS.DOC_ISSUER },
        {
          prop: "idty_issuer",
          regexp: CommonConstants.CERTIFICATION.IDTY_ISSUER,
        },
        { prop: "idty_sig", regexp: CommonConstants.CERTIFICATION.IDTY_SIG },
        {
          prop: "idty_buid",
          regexp: CommonConstants.CERTIFICATION.IDTY_TIMESTAMP,
        },
        { prop: "idty_uid", regexp: CommonConstants.CERTIFICATION.IDTY_UID },
        { prop: "buid", regexp: CommonConstants.CERTIFICATION.CERT_TIMESTAMP },
      ],
      rawer.getOfficialCertification
    );
  }

  _clean(obj: any) {
    obj.sig = obj.signature;
    obj.block = obj.buid;
    if (obj.block) {
      obj.number = obj.block.split("-")[0];
      obj.fpr = obj.block.split("-")[1];
    } else {
      obj.number = "0";
      obj.fpr = "";
    }
  }

  _verify(obj: any): string {
    return [
      "version",
      "type",
      "currency",
      "issuer",
      "idty_issuer",
      "idty_sig",
      "idty_buid",
      "idty_uid",
      "block",
    ].reduce((p, field) => {
      return p || (!obj[field] && "Wrong format for certification") || "";
    }, "");
  }
}
