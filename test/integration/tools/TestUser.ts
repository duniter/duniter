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

import {Key, KeyGen} from "../../../app/lib/common-libs/crypto/keyring"
import {IdentityDTO} from "../../../app/lib/dto/IdentityDTO";
import {TestingServer} from "./toolbox"
import {CommonConstants} from "../../../app/lib/common-libs/constants"
import {CertificationDTO} from "../../../app/lib/dto/CertificationDTO"
import {MembershipDTO} from "../../../app/lib/dto/MembershipDTO"
import {RevocationDTO} from "../../../app/lib/dto/RevocationDTO"
import {CrawlerDependency} from "../../../app/modules/crawler/index"
import {Buid} from "../../../app/lib/common-libs/buid"
import {parsers} from "../../../app/lib/common-libs/parsers/index"
import {TransactionDTO} from "../../../app/lib/dto/TransactionDTO"
import {PeerDTO} from "../../../app/lib/dto/PeerDTO"
import {Contacter} from "../../../app/modules/crawler/lib/contacter"
import {Underscore} from "../../../app/lib/common-libs/underscore"
import {HttpLookup} from "../../../app/modules/bma/lib/dtos"

const request	= require('request')

export interface TestInput {
  src:string
  unlock:string
}

export interface TestOutput {
  qty:number
  base:number
  lock:string
}

export class TestUser {

  public pub = ""
  public sec = ""
  private createdIdentity = ""

  constructor(public uid:string, private options:any, public node:any) {
    // For sync code
    if (this.options.pub && this.options.sec) {
      this.pub = this.options.pub
      this.sec = this.options.sec
    }
  }

  get keypair(): Key {
    return new Key(this.pub, this.sec)
  }

  private init(done:()=>void) {
    if (this.options.pub && this.options.sec) {
      this.pub = this.options.pub
      this.sec = this.options.sec
      done()
    } else {
      throw 'Not keypair information given for testing user ' + this.uid
    }
  }

  public async createIdentity(useRoot?:boolean|null, fromServer?:any) {
    const idty = await this.makeIdentity(useRoot)
    await this.submitIdentity(idty, fromServer);
  }

  public async makeIdentity(useRoot?:boolean|null) {
    if (!this.pub) {
      this.init(() => {})
    }
    const current = await this.node.server.BlockchainService.current();
    let buid = !useRoot && current ? Buid.format.buid(current.number, current.hash) : CommonConstants.SPECIAL_BLOCK
    this.createdIdentity = IdentityDTO.fromJSONObject({
      buid: buid,
      uid: this.uid,
      issuer: this.pub,
      currency: this.node.server.conf.currency
    }).getRawUnSigned()
    return this.createdIdentity += KeyGen(this.pub, this.sec).signSync(this.createdIdentity) + '\n'
  }

  public submitIdentity(raw:string, fromServer?: TestingServer) {
    return this.doPost('/wot/add', {
      "identity": raw
    }, fromServer)
  }

  public getIdentityRaw() {
    return this.createdIdentity
  }

  public async makeCert(user:TestUser, fromServer?:TestingServer, overrideProps?:any) {
    const lookup = await this.lookup(user.pub, fromServer)
    const current = await this.node.server.BlockchainService.current()
    const idty = Underscore.filter(lookup.results[0].uids, uidEntry => uidEntry.uid === user.uid)[0]
    let buid = current ? Buid.format.buid(current.number, current.hash) : CommonConstants.SPECIAL_BLOCK
    const cert = {
      "version": CommonConstants.DOCUMENTS_VERSION,
      "currency": this.node.server.conf.currency,
      "issuer": this.pub,
      "idty_issuer": user.pub,
      "idty_uid": idty.uid,
      "idty_buid": idty.meta.timestamp,
      "idty_sig": idty.self,
      "buid": buid,
      "sig": ""
    }
    Underscore.extend(cert, overrideProps || {});
    const rawCert = CertificationDTO.fromJSONObject(cert).getRawUnSigned()
    cert.sig = KeyGen(this.pub, this.sec).signSync(rawCert)
    return CertificationDTO.fromJSONObject(cert)
  }

  public async cert(user:TestUser, fromServer?:TestingServer, toServer?:TestingServer) {
    const cert = await this.makeCert(user, fromServer)
    await this.sendCert(cert, toServer)
  }

  public async sendCert(cert: CertificationDTO, toServer?: TestingServer) {
    return this.doPost('/wot/certify', {
      "cert": cert.getRawSigned()
    }, toServer)
  }

  public async join() {
    return await this.publishMembership("IN")
  }

  public async leave() {
    return await this.publishMembership("OUT")
  }

  public async makeRevocation(givenLookupIdty?:HttpLookup, overrideProps?:any) {
    const res = givenLookupIdty || (await this.lookup(this.pub));
    const matchingResult = Underscore.filter(res.results[0].uids, uidEntry => uidEntry.uid === this.uid)[0]
    const idty = {
      uid: matchingResult.uid,
      buid: matchingResult.meta.timestamp,
      sig: matchingResult.self
    }
    const revocation = {
      "currency": this.node.server.conf.currency,
      "issuer": this.pub,
      "uid": idty.uid,
      "sig": idty.sig,
      "buid": idty.buid,
      "revocation": ''
    };
    Underscore.extend(revocation, overrideProps || {});
    const rawRevocation = RevocationDTO.fromJSONObject(revocation).getRawUnsigned()
    revocation.revocation = KeyGen(this.pub, this.sec).signSync(rawRevocation);
    return RevocationDTO.fromJSONObject(revocation)
  }

  public async revoke(givenLookupIdty?:any) {
    const revocation = await this.makeRevocation(givenLookupIdty)
    return this.post('/wot/revoke', {
      "revocation": revocation.getRaw()
    })
  }

  public async makeMembership(type:string, fromServer?:TestingServer, overrideProps?:any) {
    const lookup = await this.lookup(this.pub, fromServer)
    const current = await this.node.server.BlockchainService.current();
    const idty = lookup.results[0].uids[0];
    const block = Buid.format.buid(current);
    const join = {
      "version": CommonConstants.DOCUMENTS_VERSION,
      "currency": this.node.server.conf.currency,
      "issuer": this.pub,
      "block": block,
      "membership": type,
      "userid": this.uid,
      "certts": idty.meta.timestamp,
      "signature": ""
    };
    Underscore.extend(join, overrideProps || {});
    const rawJoin = MembershipDTO.fromJSONObject(join).getRaw()
    join.signature = KeyGen(this.pub, this.sec).signSync(rawJoin)
    return MembershipDTO.fromJSONObject(join)
  }

  public async publishMembership(type:string) {
    const ms = await this.makeMembership(type);
    await this.sendMembership(ms)
  }

  public async sendMembership(ms: MembershipDTO, toServer?: TestingServer) {
    return this.doPost('/blockchain/membership', {
      "membership": ms.getRawSigned()
    }, toServer)
  }

  public async sendMoney(amount:number, recipient:TestUser, comment?:string) {
    const raw = await this.prepareITX(amount, recipient, comment)
    await this.sendTX(raw)
  }

  public async sendTX(rawTX:string) {
    return this.doPost('/tx/process', { transaction: rawTX })
  }

  public async prepareUTX(previousTX:string, unlocks:string[], outputs:TestOutput[], opts:any) {
    let obj = parsers.parseTransaction.syncWrite(previousTX);
    // Unlocks inputs with given "unlocks" strings
    let outputsToConsume = obj.outputs;
    if (opts.theseOutputsStart !== undefined) {
      outputsToConsume = outputsToConsume.slice(opts.theseOutputsStart);
    }
    let inputs = outputsToConsume.map((out:string, index:number) => {
      const output = TransactionDTO.outputStr2Obj(out);
      return {
        src: [output.amount, output.base, 'T', obj.hash, (opts.theseOutputsStart || 0) + index].join(':'),
        unlock: unlocks[index]
      }
    })
    return this.signed(this.prepareTX(inputs, outputs, opts))
  }

  public async prepareMTX(previousTX:string, user2:TestUser, unlocks:string[], outputs:TestOutput[], opts:any) {
    let obj = parsers.parseTransaction.syncWrite(previousTX);
    // Unlocks inputs with given "unlocks" strings
    let inputs = obj.outputs.map((out:string, index:number) => {
      const output = TransactionDTO.outputStr2Obj(out);
      return {
        src: [output.amount, output.base, 'T', obj.hash, index].join(':'),
        unlock: unlocks[index]
      }
    })
    opts = opts || {}
    opts.issuers = [this.pub, user2.pub]
    return this.signed(this.prepareTX(inputs, outputs, opts), user2)
  }

  public async prepareITX(amount:number, recipient:TestUser|string, comment?:string) {
    let sources = []
    if (!amount || !recipient) {
      throw 'Amount and recipient are required'
    }
    let http = await this.getContacter()
    let current = await http.getCurrent()
    let version = current && Math.min(CommonConstants.LAST_VERSION_FOR_TX, current.version)
    let json = await http.getSources(this.pub)
    let i = 0
    let cumulated = 0
    let commonbase = 99999999
    while (i < json.sources.length) {
      let src = json.sources[i];
      sources.push({
        'type': src.type,
        'amount': src.amount,
        'base': src.base,
        'noffset': src.noffset,
        'identifier': src.identifier
      })
      commonbase = Math.min(commonbase, src.base);
      cumulated += src.amount * Math.pow(10, src.base);
      i++;
    }
    if (cumulated < amount) {
      throw 'You do not have enough coins! (' + cumulated + ' ' + this.node.server.conf.currency + ' left)';
    }
    let sources2 = [];
    let total = 0;
    for (let j = 0; j < sources.length && total < amount; j++) {
      let src = sources[j];
      total += src.amount * Math.pow(10, src.base);
      sources2.push(src);
    }
    let inputSum = 0;
    sources2.forEach((src) => inputSum += src.amount * Math.pow(10, src.base));
    let inputs = sources2.map((src) => {
      return {
        src: [src.amount, src.base].concat([src.type, src.identifier, src.noffset]).join(':'),
        unlock: 'SIG(0)'
      };
    });
    let outputs = [{
      qty: amount,
      base: commonbase,
      lock: 'SIG(' + (typeof recipient === 'string' ? recipient : recipient.pub) + ')'
    }];
    if (inputSum - amount > 0) {
      // Rest back to issuer
      outputs.push({
        qty: inputSum - amount,
        base: commonbase,
        lock: "SIG(" + this.pub + ")"
      });
    }
    let raw = this.prepareTX(inputs, outputs, {
      version: version,
      blockstamp: current && [current.number, current.hash].join('-'),
      comment: comment
    });
    return this.signed(raw)
  }

  private signed(raw:string, user2?:TestUser) {
    let signatures = [KeyGen(this.pub, this.sec).signSync(raw)];
    if (user2) {
      signatures.push(KeyGen(user2.pub, user2.sec).signSync(raw));
    }
    return raw + signatures.join('\n') + '\n';
  }

  public makeTX(inputs:TestInput[], outputs:TestOutput[], theOptions:any) {
    const raw = this.prepareTX(inputs, outputs, theOptions)
    return this.signed(raw)
  }

  public prepareTX(inputs:TestInput[], outputs:TestOutput[], theOptions:any) {
    let opts = theOptions || {};
    let issuers = opts.issuers || [this.pub];
    let raw = '';
    raw += "Version: " + (opts.version || CommonConstants.TRANSACTION_VERSION) + '\n';
    raw += "Type: Transaction\n";
    raw += "Currency: " + (opts.currency || this.node.server.conf.currency) + '\n';
    raw += "Blockstamp: " + opts.blockstamp + '\n';
    raw += "Locktime: " + (opts.locktime || 0) + '\n';
    raw += "Issuers:\n";
    issuers.forEach((issuer:string) => raw += issuer + '\n');
    raw += "Inputs:\n";
    inputs.forEach(function (input) {
      raw += input.src + '\n';
    });
    raw += "Unlocks:\n";
    inputs.forEach(function (input, index) {
      if (input.unlock) {
        raw += index + ":" + input.unlock + '\n';
      }
    });
    raw += "Outputs:\n";
    outputs.forEach(function (output) {
      raw += [output.qty, output.base, output.lock].join(':') + '\n';
    });
    raw += "Comment: " + (opts.comment || "") + "\n";
    return raw;
  }

  public async makePeer(endpoints:string[], overrideProps:any) {
    const peer = PeerDTO.fromJSONObject({
      currency: this.node.server.conf.currency,
      pubkey: this.pub,
      block: '2-00008DF633FC158F9DB4864ABED696C1AA0FE5D617A7B5F7AB8DE7CA2EFCD4CB',
      endpoints: endpoints
    });
    Underscore.extend(peer, overrideProps || {});
    const rawPeer = PeerDTO.fromJSONObject(peer).getRawUnsigned()
    peer.signature = KeyGen(this.pub, this.sec).signSync(rawPeer)
    return PeerDTO.fromJSONObject(peer)
  }

  private async post(uri:string, data:any, done?:(e?:any, res?:any, body?:string)=>void) {
    return new Promise((resolve, reject) => {
      var postReq = request.post({
        "uri": 'http://' + [this.node.server.conf.remoteipv4, this.node.server.conf.remoteport].join(':') + uri,
        "timeout": 1000 * 100000
      }, function (err:any, res:any, body:string) {
        err = err || (res.statusCode != 200 && body != 'Already up-to-date' && body) || null;
        if (err) {
          reject(err)
        } else {
          resolve(res)
        }
        done && done(err, res, body)
      });
      postReq.form(data);
    })
  }

  private async doPost(uri:string, data:any, toServer?:TestingServer) {
    const ip = toServer ? toServer.conf.ipv4 : this.node.server.conf.remoteipv4;
    const port = toServer ? toServer.conf.port : this.node.server.conf.remoteport;
    return new Promise((resolve, reject) => {
      var postReq = request.post({
        "uri": 'http://' + [ip, port].join(':') + uri,
        "timeout": 1000 * 100000
      }, function (err:any, res:any, body:string) {
        err = err || (res.statusCode != 200 && body != 'Already up-to-date' && body) || null;
        err ? reject(err) : resolve(res);
      });
      postReq.form(data);
    });
  }

  private async getContacter(fromServer?:TestingServer) {
    const that = this
    return new Promise<Contacter>(function(resolve){
      let theNode = (fromServer && { server: fromServer }) || that.node
      resolve(CrawlerDependency.duniter.methods.contacter(theNode.server.conf.ipv4, theNode.server.conf.port, {
        timeout: 1000 * 100000
      }));
    });
  }

  public async lookup(pubkey:string, fromServer?:TestingServer): Promise<HttpLookup> {
    const node2 = await this.getContacter(fromServer)
    return node2.getLookup(pubkey);
  }
}
