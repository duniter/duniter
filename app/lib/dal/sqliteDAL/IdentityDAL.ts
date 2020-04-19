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

import { AbstractSQLite } from "./AbstractSQLite";
import { SQLiteDriver } from "../drivers/SQLiteDriver";
import { SandBox } from "./SandBox";
import { IdentityDTO } from "../../dto/IdentityDTO";
import { Cloneable } from "../../dto/Cloneable";
import { DBDocument } from "./DocumentDAL";

const constants = require("../../constants");

export abstract class DBIdentity implements Cloneable {
  clone(): any {
    return DBIdentity.copyFromExisting(this);
  }

  certs: any[] = [];
  signed: {
    idty: {
      pubkey: string;
      uid: string;
      buid: string;
      sig: string;
      member: string;
      wasMember: string;
    };
    block_number: number;
    block_hash: string;
    sig: string;
  }[] = [];

  revoked: boolean;
  currentMSN: null;
  currentINN: null;
  buid: string;
  member: boolean;
  kick: boolean;
  leaving: boolean | null;
  wasMember: boolean;
  pubkey: string;
  uid: string;
  sig: string;
  revocation_sig: string | null;
  hash: string;
  written: boolean;
  wotb_id: number | null;
  revoked_on: number | null;
  expires_on: number;

  getTargetHash() {
    return IdentityDTO.getTargetHash({
      pub: this.pubkey,
      created_on: this.buid,
      uid: this.uid,
    });
  }

  json() {
    const others: any[] = [];
    this.certs.forEach((cert) => {
      others.push({
        pubkey: cert.from,
        meta: {
          block_number: cert.block_number,
          block_hash: cert.block_hash,
        },
        uids: cert.uids,
        isMember: cert.isMember,
        wasMember: cert.wasMember,
        signature: cert.sig,
      });
    });
    const uids = [
      {
        uid: this.uid,
        meta: {
          timestamp: this.buid,
        },
        revoked: this.revoked,
        revoked_on: parseInt(String(this.revoked_on)),
        revocation_sig: this.revocation_sig,
        self: this.sig,
        others: others,
      },
    ];
    const signed: any[] = [];
    this.signed.forEach((cert) => {
      signed.push({
        uid: cert.idty.uid,
        pubkey: cert.idty.pubkey,
        meta: {
          timestamp: cert.idty.buid,
        },
        cert_time: {
          block: cert.block_number,
          block_hash: cert.block_hash,
        },
        isMember: cert.idty.member,
        wasMember: cert.idty.wasMember,
        signature: cert.sig,
      });
    });
    return {
      pubkey: this.pubkey,
      uids: uids,
      signed: signed,
    };
  }

  static copyFromExisting(idty: DBIdentity) {
    return new ExistingDBIdentity(idty);
  }
}

export class NewDBIdentity extends DBIdentity {
  revoked = false;
  currentMSN = null;
  currentINN = null;
  member = false;
  kick = false;
  leaving = false;
  wasMember = false;
  revocation_sig = null;
  written = false;
  wotb_id = null;
  revoked_on = null;
  expires_on = 0;

  constructor(
    public pubkey: string,
    public sig: string,
    public buid: string,
    public uid: string,
    public hash: string
  ) {
    super();
  }
}

export class ExistingDBIdentity extends DBIdentity {
  constructor(idty: DBIdentity) {
    super();
    this.pubkey = idty.pubkey;
    this.sig = idty.sig;
    this.buid = idty.buid;
    this.uid = idty.uid;
    this.hash = idty.hash;
    this.revoked = idty.revoked;
    this.currentMSN = idty.currentMSN;
    this.currentINN = idty.currentINN;
    this.member = idty.member;
    this.kick = idty.kick;
    this.leaving = idty.leaving;
    this.wasMember = idty.wasMember;
    this.revocation_sig = idty.revocation_sig;
    this.written = idty.written;
    this.wotb_id = idty.wotb_id;
    this.revoked_on = idty.revoked_on;
    this.expires_on = idty.expires_on;
    this.certs = idty.certs || [];
    this.signed = idty.signed || [];
  }
}

export interface DBSandboxIdentity extends DBDocument {
  certsCount: number;
  ref_block: number;
}

export class IdentityDAL extends AbstractSQLite<DBIdentity> {
  constructor(driver: SQLiteDriver) {
    super(
      driver,
      "idty",
      // PK fields
      ["pubkey", "uid", "hash"],
      // Fields
      [
        "revoked",
        "revoked_on",
        "revocation_sig",
        "currentMSN",
        "currentINN",
        "buid",
        "member",
        "kick",
        "leaving",
        "wasMember",
        "pubkey",
        "uid",
        "sig",
        "hash",
        "written",
        "wotb_id",
        "expired",
        "expires_on",
        "removed",
      ],
      // Arrays
      [],
      // Booleans
      [
        "revoked",
        "member",
        "kick",
        "leaving",
        "wasMember",
        "written",
        "removed",
      ],
      // BigIntegers
      [],
      // Transient
      ["certsCount", "ref_block"]
    );
  }

  async init() {
    await this.exec(
      "BEGIN;" +
        "CREATE TABLE IF NOT EXISTS " +
        this.table +
        " (" +
        "revoked BOOLEAN NOT NULL," +
        "currentMSN INTEGER NULL," +
        "currentINN INTEGER NULL," +
        "buid VARCHAR(100) NOT NULL," +
        "member BOOLEAN NOT NULL," +
        "kick BOOLEAN NOT NULL," +
        "leaving BOOLEAN NULL," +
        "wasMember BOOLEAN NOT NULL," +
        "pubkey VARCHAR(50) NOT NULL," +
        "uid VARCHAR(255) NOT NULL," +
        "sig VARCHAR(100) NOT NULL," +
        "revocation_sig VARCHAR(100) NULL," +
        "hash VARCHAR(64) NOT NULL," +
        "written BOOLEAN NULL," +
        "wotb_id INTEGER NULL," +
        "expires_on INTEGER NULL," +
        "PRIMARY KEY (pubkey,uid,hash)" +
        ");" +
        "CREATE INDEX IF NOT EXISTS idx_idty_pubkey ON idty (pubkey);" +
        "CREATE INDEX IF NOT EXISTS idx_idty_uid ON idty (uid);" +
        "CREATE INDEX IF NOT EXISTS idx_idty_kick ON idty (kick);" +
        "CREATE INDEX IF NOT EXISTS idx_idty_member ON idty (member);" +
        "CREATE INDEX IF NOT EXISTS idx_idty_wasMember ON idty (wasMember);" +
        "CREATE INDEX IF NOT EXISTS idx_idty_hash ON idty (hash);" +
        "CREATE INDEX IF NOT EXISTS idx_idty_written ON idty (written);" +
        "CREATE INDEX IF NOT EXISTS idx_idty_currentMSN ON idty (currentMSN);" +
        "CREATE INDEX IF NOT EXISTS idx_idty_currentINN ON idty (currentINN);" +
        "COMMIT;"
    );
  }

  revokeIdentity(pubkey: string) {
    return this.exec(
      "DELETE FROM " + this.table + " WHERE pubkey = '" + pubkey + "'"
    );
  }

  removeUnWrittenWithPubkey(pubkey: string) {
    return this.sqlRemoveWhere({
      pubkey: pubkey,
      written: false,
    });
  }

  removeUnWrittenWithUID(uid: string) {
    return this.sqlRemoveWhere({
      uid: uid,
      written: false,
    });
  }

  setRevoked(pubkey: string) {
    return this.query(
      "UPDATE " + this.table + " SET revoked = ? WHERE pubkey = ?",
      [true, pubkey]
    );
  }

  getByHash(hash: string) {
    return this.sqlFindOne({
      hash: hash,
    });
  }

  saveIdentity(idty: DBIdentity) {
    return this.saveEntity(idty);
  }

  async deleteByHash(hash: string) {
    await this.exec(
      "UPDATE " + this.table + " SET removed = 1 where hash = '" + hash + "'"
    );
  }

  getToRevoke() {
    return this.sqlFind({
      revocation_sig: { $null: false },
      revoked: false,
      wasMember: true,
    });
  }

  getPendingIdentities() {
    return this.sqlFind({
      revocation_sig: { $null: true },
      revoked: false,
    });
  }

  searchThoseMatching(search: string) {
    return this.sqlFindLikeAny({
      pubkey: "%" + search + "%",
      uid: "%" + search + "%",
    });
  }

  async trimExpiredIdentities(medianTime: number) {
    await this.exec(
      "DELETE FROM " +
        this.table +
        " WHERE (expires_on IS NULL AND revocation_sig IS NULL) OR expires_on < " +
        medianTime
    );
  }

  /**************************
   * SANDBOX STUFF
   */

  getSandboxIdentities() {
    return this.query(
      "SELECT * FROM sandbox_idty LIMIT " + this.sandbox.maxSize,
      []
    );
  }

  sandbox = new SandBox(
    constants.SANDBOX_SIZE_IDENTITIES,
    this.getSandboxIdentities.bind(this),
    (compared: DBSandboxIdentity, reference: DBSandboxIdentity) => {
      if (compared.certsCount < reference.certsCount) {
        return -1;
      } else if (compared.certsCount > reference.certsCount) {
        return 1;
      } else if (compared.ref_block < reference.ref_block) {
        return -1;
      } else if (compared.ref_block > reference.ref_block) {
        return 1;
      } else {
        return 0;
      }
    }
  );

  getSandboxRoom() {
    return this.sandbox.getSandboxRoom();
  }

  setSandboxSize(maxSize: number) {
    this.sandbox.maxSize = maxSize;
  }
}
