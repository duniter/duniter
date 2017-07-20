"use strict";
import {BlockDTO} from "../../../lib/dto/BlockDTO"

const _ = require('underscore')

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
  json.len = parseInt(block.len)
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
    json.transactions.push(_(obj).omit('raw', 'certifiers', 'hash'));
  });
  json.transactions = block.transactions.map((tx:any) => {
    tx.inputs = tx.inputs.map((i:any) => i.raw || i)
    tx.outputs = tx.outputs.map((o:any) => o.raw || o)
    return tx
  })
  json.raw = BlockDTO.fromJSONObject(block).getRawUnSigned()
  return json;
}