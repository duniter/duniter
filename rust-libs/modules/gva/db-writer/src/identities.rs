//  Copyright (C) 2020 Éloïs SANCHEZ.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

use crate::*;
use duniter_dbs::databases::gva_v1::GvaIdentitiesEvent;

pub(crate) fn update_identities<B: Backend>(
    block: &DubpBlockV10,
    identities: &mut TxColRw<B::Col, GvaIdentitiesEvent>,
) -> KvResult<()> {
    for mb in block.joiners() {
        let pubkey = mb.issuers()[0];

        let mut idty = identities.get(&PubKeyKeyV2(pubkey))?.unwrap_or_default();
        idty.is_member = true;
        idty.joins.push(block.number());
        identities.upsert(PubKeyKeyV2(pubkey), idty);
    }
    for revo in block.revoked() {
        let pubkey = revo.issuer;
        if let Some(mut idty) = identities.get(&PubKeyKeyV2(pubkey))? {
            idty.is_member = false;
            idty.leaves.insert(block.number());
            identities.upsert(PubKeyKeyV2(pubkey), idty)
        }
    }
    for pubkey in block.excluded().iter().copied() {
        if let Some(mut idty) = identities.get(&PubKeyKeyV2(pubkey))? {
            idty.is_member = false;
            idty.leaves.insert(block.number());
            identities.upsert(PubKeyKeyV2(pubkey), idty)
        }
    }
    Ok(())
}

pub(crate) fn revert_identities<B: Backend>(
    block: &DubpBlockV10,
    identities: &mut TxColRw<B::Col, GvaIdentitiesEvent>,
) -> KvResult<()> {
    for mb in block.joiners() {
        let pubkey = mb.issuers()[0];

        let mut idty = identities.get(&PubKeyKeyV2(pubkey))?.unwrap_or_default();
        idty.is_member = false;
        idty.joins.pop();
        identities.upsert(PubKeyKeyV2(pubkey), idty);
    }
    for idty in block.identities() {
        let pubkey = idty.issuers()[0];
        identities.remove(PubKeyKeyV2(pubkey));
    }
    for revo in block.revoked() {
        let pubkey = revo.issuer;
        if let Some(mut idty) = identities.get(&PubKeyKeyV2(pubkey))? {
            idty.is_member = true;
            idty.leaves.remove(&block.number());
            identities.upsert(PubKeyKeyV2(pubkey), idty)
        }
    }
    for pubkey in block.excluded().iter().copied() {
        if let Some(mut idty) = identities.get(&PubKeyKeyV2(pubkey))? {
            idty.is_member = true;
            idty.leaves.remove(&block.number());
            identities.upsert(PubKeyKeyV2(pubkey), idty)
        }
    }
    Ok(())
}
