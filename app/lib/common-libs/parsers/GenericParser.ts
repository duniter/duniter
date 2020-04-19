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
import * as stream from "stream";
import { hashf } from "../../../lib/common";
import { NewLogger } from "../../logger";

const logger = NewLogger();

export abstract class GenericParser extends stream.Transform {
  constructor(private captures: any, private rawerFunc: any) {
    super({ decodeStrings: false, objectMode: true });
  }

  abstract _clean(obj: any): void;
  abstract _verify(obj: any): any;

  static _simpleLineExtraction(pr: any, rawEntry: string, cap: any) {
    const fieldValue = rawEntry.match(cap.regexp);
    if (fieldValue && fieldValue.length >= 2) {
      pr[cap.prop] = cap.parser ? cap.parser(fieldValue[1], pr) : fieldValue[1];
    }
    return;
  }

  syncWrite(str: string): any {
    let error = "";
    const obj = {};
    this._parse(str, obj);
    this._clean(obj);
    if (!error) {
      error = this._verify(obj);
    }
    if (!error) {
      const raw = this.rawerFunc(obj);
      if (hashf(str) !== hashf(raw))
        error = CommonConstants.ERRORS.WRONG_DOCUMENT.uerr.message;
      if (error) {
        logger && logger.trace(error);
        logger && logger.trace("-----------------");
        logger && logger.trace("Written: %s", JSON.stringify({ str: str }));
        logger && logger.trace("Extract: %s", JSON.stringify({ raw: raw }));
        logger && logger.trace("-----------------");
      }
    }
    if (error) {
      logger && logger.trace(error);
      throw CommonConstants.ERRORS.WRONG_DOCUMENT;
    }
    return obj;
  }

  _parse(str: string, obj: any) {
    let error;
    if (!str) {
      error = "No document given";
    } else {
      error = "";
      obj.hash = hashf(str).toUpperCase();
      // Divide in 2 parts: document & signature
      const sp = str.split("\n");
      if (sp.length < 3) {
        error = "Wrong document: must have at least 2 lines";
      } else {
        const endOffset = str.match(/\n$/) ? 2 : 1;
        obj.signature = sp[sp.length - endOffset];
        obj.hash = hashf(str).toUpperCase();
        obj.raw = sp.slice(0, sp.length - endOffset).join("\n") + "\n";
        const docLF = obj.raw.replace(/\r\n/g, "\n");
        if (docLF.match(/\n$/)) {
          this.captures.forEach((cap: any) => {
            GenericParser._simpleLineExtraction(obj, docLF, cap);
          });
        } else {
          error =
            "Bad document structure: no new line character at the end of the document.";
        }
      }
    }
    return error;
  }
}
