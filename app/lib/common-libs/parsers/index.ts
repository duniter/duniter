import {BlockParser} from "./block"
import {CertificationParser} from "./certification"
import {IdentityParser} from "./identity"
import {MembershipParser} from "./membership"
import {PeerParser} from "./peer"
import {RevocationParser} from "./revocation"
import {TransactionParser} from "./transaction"

export const parsers = {
  parseIdentity:      new IdentityParser(),
  parseCertification: new CertificationParser(),
  parseRevocation:    new RevocationParser(),
  parseTransaction:   new TransactionParser(),
  parsePeer:          new PeerParser(),
  parseMembership:    new MembershipParser(),
  parseBlock:         new BlockParser()
}
