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

import {BlockDTO} from "../../../lib/dto/BlockDTO"
import {Underscore} from "../../../lib/common-libs/underscore"

export const stat = (stat:any) => {
  return { "blocks": stat.blocks }
}

export const block = (block:any) => {
  const json:any = {};
  json.version = parseInt(block.version)
  json.nonce = parseInt(block.nonce)
  json.number = parseInt(block.number)
  json.powMin = parseInt(block.powMin)
  json.time = parseInt(block.time)
  json.medianTime = parseInt(block.medianTime)
  json.membersCount = parseInt(block.membersCount)
  json.monetaryMass = parseInt(block.monetaryMass)
  json.unitbase = parseInt(block.unitbase)
  json.issuersCount = parseInt(block.issuersCount)
  json.issuersFrame = parseInt(block.issuersFrame)
  json.issuersFrameVar = parseInt(block.issuersFrameVar)
  json.currency = block.currency || ""
  json.issuer = block.issuer || ""
  json.signature = block.signature || ""
  json.hash = block.hash || ""
  json.parameters = block.parameters || ""
  json.previousHash = block.previousHash || null
  json.previousIssuer = block.previousIssuer || null
  json.inner_hash = block.inner_hash || null
  json.dividend = parseInt(block.dividend) || null
  json.identities = (block.identities || [])
  json.joiners = (block.joiners || [])
  json.actives = (block.actives || [])
  json.leavers = (block.leavers || [])
  json.revoked = (block.revoked || [])
  json.excluded = (block.excluded || [])
  json.certifications = (block.certifications || [])
  json.transactions = [];
  block.transactions.forEach((obj:any) => {
    json.transactions.push(Underscore.omit(obj, 'raw', 'certifiers', 'hash'))
  });
  json.transactions = block.transactions.map((tx:any) => {
    tx.inputs = tx.inputs.map((i:any) => i.raw || i)
    tx.outputs = tx.outputs.map((o:any) => o.raw || o)
    return tx
  })
  json.raw = BlockDTO.fromJSONObject(block).getRawUnSigned()
  return json;
}