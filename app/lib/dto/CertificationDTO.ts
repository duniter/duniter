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

import { IdentityDTO } from "./IdentityDTO";
import { Buid } from "../common-libs/buid";
import { Cloneable } from "./Cloneable";
import { hashf } from "../common";

const DEFAULT_DOCUMENT_VERSION = 10;

export class ShortCertificationDTO {
  constructor(
    public pubkey: string,
    public block_number: number,
    public sig: string,
    public idty_issuer: string
  ) {}

  get issuer() {
    return this.pubkey;
  }

  get from() {
    return this.pubkey;
  }

  get to() {
    return this.idty_issuer;
  }
}

export class CertificationDTO extends ShortCertificationDTO
  implements Cloneable {
  clone(): any {
    return CertificationDTO.fromJSONObject(this);
  }

  constructor(
    public version: number,
    public currency: string,
    public pubkey: string,
    public buid: string,
    public sig: string,
    public idty_issuer: string,
    public idty_uid: string,
    public idty_buid: string,
    public idty_sig: string
  ) {
    super(pubkey, parseInt(buid.split(":")[0]), sig, idty_issuer);
  }

  getTargetHash() {
    return IdentityDTO.getTargetHash({
      uid: this.idty_uid,
      created_on: this.idty_buid,
      pub: this.idty_issuer,
    });
  }

  getRawUnSigned() {
    let raw = "";
    raw += "Version: " + this.version + "\n";
    raw += "Type: Certification\n";
    raw += "Currency: " + this.currency + "\n";
    raw += "Issuer: " + this.pubkey + "\n";
    raw += "IdtyIssuer: " + this.idty_issuer + "\n";
    raw += "IdtyUniqueID: " + this.idty_uid + "\n";
    raw += "IdtyTimestamp: " + this.idty_buid + "\n";
    raw += "IdtySignature: " + this.idty_sig + "\n";
    raw += "CertTimestamp: " + this.buid + "\n";
    return raw;
  }

  getRawSigned() {
    return this.getRawUnSigned() + this.sig + "\n";
  }

  json() {
    return {
      issuer: this.pubkey,
      timestamp: this.buid,
      sig: this.sig,
      target: {
        issuer: this.idty_issuer,
        uid: this.idty_uid,
        timestamp: this.idty_buid,
        sig: this.idty_sig,
      },
    };
  }

  inline() {
    return [this.pubkey, this.to, this.block_number, this.sig].join(":");
  }

  static fromInline(inline: string): ShortCertificationDTO {
    const [pubkey, to, block_number, sig]: string[] = inline.split(":");
    return new ShortCertificationDTO(pubkey, parseInt(block_number), sig, to);
  }

  static fromJSONObject(obj: any) {
    return new CertificationDTO(
      obj.version || DEFAULT_DOCUMENT_VERSION,
      obj.currency,
      obj.pubkey || obj.issuer || obj.from,
      obj.buid || Buid.format.buid(obj.block_number, obj.block_hash),
      obj.sig,
      obj.idty_issuer || obj.to,
      obj.idty_uid,
      obj.idty_buid,
      obj.idty_sig
    );
  }

  getHash() {
    return hashf(this.getRawSigned());
  }
}
