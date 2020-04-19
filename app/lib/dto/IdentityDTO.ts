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

import { RevocationDTO } from "./RevocationDTO";
import { hashf } from "../common";
import { DBIdentity, NewDBIdentity } from "../dal/sqliteDAL/IdentityDAL";

const DEFAULT_DOCUMENT_VERSION = 10;

export interface HashableIdentity {
  created_on: string;
  uid: string;
  pub: string;
}

export interface BasicIdentity {
  buid: string;
  uid: string;
  pubkey: string;
  sig: string;
}

export interface BasicRevocableIdentity {
  buid: string;
  uid: string;
  pubkey: string;
  sig: string;
  member: boolean;
  wasMember: boolean;
  expires_on: number;
}

export class IdentityDTO {
  constructor(
    public version: number,
    public currency: string,
    public pubkey: string,
    public sig: string,
    public buid: string,
    public uid: string
  ) {}

  get hash() {
    return this.getTargetHash();
  }

  private getTargetHash() {
    return hashf(this.uid + this.buid + this.pubkey);
  }

  inline() {
    return [this.pubkey, this.sig, this.buid, this.uid].join(":");
  }

  rawWithoutSig() {
    let raw = "";
    raw += "Version: " + this.version + "\n";
    raw += "Type: Identity\n";
    raw += "Currency: " + this.currency + "\n";
    raw += "Issuer: " + this.pubkey + "\n";
    raw += "UniqueID: " + this.uid + "\n";
    raw += "Timestamp: " + this.buid + "\n";
    return raw;
  }

  getRawUnSigned() {
    return this.rawWithoutSig();
  }

  getRawSigned() {
    return this.rawWithoutSig() + this.sig + "\n";
  }

  static fromInline(inline: string, currency: string = ""): IdentityDTO {
    const [pubkey, sig, buid, uid] = inline.split(":");
    return new IdentityDTO(
      DEFAULT_DOCUMENT_VERSION,
      currency,
      pubkey,
      sig,
      buid,
      uid
    );
  }

  static getTargetHash(idty: HashableIdentity) {
    return hashf(idty.uid + idty.created_on + idty.pub);
  }

  static fromJSONObject(obj: any) {
    return new IdentityDTO(
      obj.version || DEFAULT_DOCUMENT_VERSION,
      obj.currency,
      obj.issuer || obj.pubkey || obj.pub,
      obj.signature || obj.sig,
      obj.buid || obj.blockstamp,
      obj.uid
    );
  }

  static fromBasicIdentity(basic: BasicIdentity): DBIdentity {
    return new NewDBIdentity(
      basic.pubkey,
      basic.sig,
      basic.buid,
      basic.uid,
      IdentityDTO.getTargetHash({
        pub: basic.pubkey,
        created_on: basic.buid,
        uid: basic.uid,
      })
    );
  }

  static fromRevocation(revoc: RevocationDTO): DBIdentity {
    return new NewDBIdentity(
      revoc.pubkey,
      revoc.idty_sig,
      revoc.idty_buid,
      revoc.idty_uid,
      IdentityDTO.getTargetHash({
        pub: revoc.pubkey,
        created_on: revoc.idty_buid,
        uid: revoc.idty_uid,
      })
    );
  }

  getHash() {
    return hashf(this.getRawSigned());
  }
}
