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

import {CrawlerConstants} from "./constants"

const rp = require('request-promise');
const sanitize = require('../../../modules/bma/lib/sanitize')
const dtos = require('../../../modules/bma').BmaDependency.duniter.methods.dtos;

export class Contacter {

  options:{ timeout:number }
  fullyQualifiedHost:string

  constructor(public readonly host:string, public readonly port:number, opts:any = {}) {
    this.options = {
      timeout: (opts && opts.timeout) || CrawlerConstants.DEFAULT_TIMEOUT
    }
    // We suppose that IPv6 is already wrapped by [], for example 'http://[::1]:80/index.html'
    this.fullyQualifiedHost = [host, port].join(':');
  }

  getSummary() {
    return this.get('/node/summary/', dtos.Summary)
  }
  
  getCertifiedBy(search:string) {
    return this.get('/wot/certified-by/' + search, dtos.Certifications)
  }
  
  getRequirements(search:string) {
    return this.get('/wot/requirements/' + search, dtos.Requirements)
  }
  
  getRequirementsPending(minsig:number) {
    return this.get('/wot/requirements-of-pending/' + minsig, dtos.Requirements)
  }
  
  getLookup(search:string) {
    return this.get('/wot/lookup/', dtos.Lookup, search)
  }
  
  getBlock(number:number) {
    return this.get('/blockchain/block/', dtos.Block, number)
  }
  
  getCurrent() {
    return this.get('/blockchain/current', dtos.Block)
  }
  
  getPeer() {
    return this.get('/network/peering', dtos.Peer)
  }
  
  getPeers(obj?:any) {
    return this.get('/network/peering/peers', dtos.MerkleOfPeers, obj)
  }

  getPeersArray() {
    return this.get('/network/peers', dtos.Peers)
  }
  
  getSources(pubkey:string) {
    return this.get('/tx/sources/', dtos.Sources, pubkey)
  }
  
  getBlocks(count:number, fromNumber:number) {
    return this.get('/blockchain/blocks/', dtos.Blocks, [count, fromNumber].join('/'))
  }
  
  postPeer(peer:any) {
    return this.post('/network/peering/peers', dtos.Peer, { peer: peer })
  }
  
  postIdentity(raw:string) {
    return this.post('/wot/add', dtos.Identity, { identity: raw })
  }
  
  postCert(cert:string) {
    return this.post('/wot/certify', dtos.Cert, { cert: cert})
  }
  
  postRenew(ms:string) {
    return this.post('/blockchain/membership', dtos.Membership, { membership: ms })
  }
  
  wotPending() {
    return this.get('/wot/pending', dtos.MembershipList)
  }
  
  wotMembers() {
    return this.get('/wot/members', dtos.Members)
  }
  
  postBlock(rawBlock:string) {
    return this.post('/blockchain/block', dtos.Block, { block: rawBlock })
  }
  
  processTransaction(rawTX:string) {
    return this.post('/tx/process', dtos.Transaction, { transaction: rawTX })
  }

  private async get(url:string, dtoContract:any, param?:any) {
    if (typeof param === 'object') {
      // Classical URL params (a=1&b=2&...)
      param = '?' + Object.keys(param).map((k) => [k, param[k]].join('=')).join('&');
    }
    try {
      const json = await rp.get({
        url: Contacter.protocol(this.port) + this.fullyQualifiedHost + url + (param !== undefined ? param : ''),
        json: true,
        timeout: this.options.timeout
      });
      // Prevent JSON injection
      return sanitize(json, dtoContract);
    } catch (e) {
      throw e.error;
    }
  }

  private async post(url:string, dtoContract:any, data:any) {
    try {
      const json = await rp.post({
        url: Contacter.protocol(this.port) + this.fullyQualifiedHost + url,
        body: data,
        json: true,
        timeout: this.options.timeout
      });
      // Prevent JSON injection
      return sanitize(json, dtoContract);
    } catch (e) {
      throw e.error;
    }
  }

  static protocol(port:number) {
    return port == 443 ? 'https://' : 'http://';
  }

  static async quickly(host:string, port:number, opts:any, callbackPromise:any) {
    const node = new Contacter(host, port, opts);
    return callbackPromise(node);
  }

  static async quickly2(peer:any, opts:any, callbackPromise:any) {
    const Peer = require('./entity/peer');
    const p = Peer.fromJSON(peer);
    const node = new Contacter(p.getHostPreferDNS(), p.getPort(), opts);
    return callbackPromise(node);
  }

  static fetchPeer(host:string, port:number, opts:any = {}) {
    return Contacter.quickly(host, port, opts, (node:any) => node.getPeer())
  }

  static fetchBlock(number:number, peer:any, opts:any = {}) {
    return Contacter.quickly2(peer, opts, (node:any) => node.getBlock(number))
  }

  static async isReachableFromTheInternet(peer:any, opts:any) {
    const Peer = require('./entity/peer');
    const p = Peer.fromJSON(peer);
    const node = new Contacter(p.getHostPreferDNS(), p.getPort(), opts);
    try {
      await node.getPeer();
      return true;
    } catch (e) {
      return false;
    }
  }
}