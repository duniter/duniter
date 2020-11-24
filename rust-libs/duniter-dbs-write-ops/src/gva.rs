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

mod identities;
mod tx;
mod utxos;

use crate::*;
use duniter_dbs::gva_v1::{BalancesEvent, GvaIdentitiesEvent};

pub fn apply_block<B: Backend>(block: &DubpBlockV10, gva_db: &GvaV1Db<B>) -> KvResult<()> {
    let blockstamp = Blockstamp {
        number: block.number(),
        hash: block.hash(),
    };
    (gva_db.balances_write(), gva_db.gva_identities_write()).write(
        |(mut balances, mut gva_identities)| {
            identities::update_identities::<B>(&block, &mut gva_identities)?;
            if let Some(divident_amount) = block.dividend() {
                apply_ud::<B>(divident_amount, &mut balances, &mut gva_identities)?;
            }
            Ok(())
        },
    )?;
    apply_block_txs(
        &gva_db,
        blockstamp,
        block.common_time() as i64,
        block.transactions(),
    )?;

    Ok(())
}

pub fn revert_block<B: Backend>(block: &DubpBlockV10, gva_db: &GvaV1Db<B>) -> KvResult<()> {
    (gva_db.balances_write(), gva_db.gva_identities_write()).write(
        |(mut balances, mut gva_identities)| {
            identities::revert_identities::<B>(&block, &mut gva_identities)?;
            if let Some(divident_amount) = block.dividend() {
                revert_ud::<B>(divident_amount, &mut balances, &mut gva_identities)?;
            }
            Ok(())
        },
    )?;
    for tx in block.transactions() {
        let tx_hash = tx.get_hash();
        tx::revert_tx(gva_db, &tx_hash)?.ok_or_else(|| {
            KvError::DbCorrupted(format!("GVA: tx '{}' dont exist on txs history.", tx_hash,))
        })?;
    }

    Ok(())
}

fn apply_ud<B: Backend>(
    divident_amount: SourceAmount,
    balances: &mut TxColRw<B::Col, BalancesEvent>,
    identities: &mut TxColRw<B::Col, GvaIdentitiesEvent>,
) -> KvResult<()> {
    let members = identities.iter(.., |it| {
        it.filter_map_ok(|(pk, idty)| if idty.is_member { Some(pk.0) } else { None })
            .collect::<KvResult<Vec<_>>>()
    })?;
    for member in members {
        // Increase account balance
        let account_script = WalletScriptV10::single_sig(member);
        let balance = balances
            .get(WalletConditionsV2::from_ref(&account_script))?
            .unwrap_or_default();
        balances.upsert(
            WalletConditionsV2(account_script),
            SourceAmountValV2(balance.0 + divident_amount),
        );
    }
    Ok(())
}

fn revert_ud<B: Backend>(
    divident_amount: SourceAmount,
    balances: &mut TxColRw<B::Col, BalancesEvent>,
    identities: &mut TxColRw<B::Col, GvaIdentitiesEvent>,
) -> KvResult<()> {
    let members = identities.iter(.., |it| {
        it.filter_map_ok(|(pk, idty)| if idty.is_member { Some(pk.0) } else { None })
            .collect::<KvResult<Vec<_>>>()
    })?;
    for member in members {
        // Increase account balance
        let account_script = WalletScriptV10::single_sig(member);
        if let Some(SourceAmountValV2(balance)) =
            balances.get(WalletConditionsV2::from_ref(&account_script))?
        {
            balances.upsert(
                WalletConditionsV2(account_script),
                SourceAmountValV2(balance - divident_amount),
            );
        }
    }
    Ok(())
}

fn apply_block_txs<B: Backend>(
    gva_db: &GvaV1Db<B>,
    current_blockstamp: Blockstamp,
    current_time: i64,
    txs: &[TransactionDocumentV10],
) -> KvResult<()> {
    for tx in txs {
        let tx_hash = tx.get_hash();
        // Write tx and update sources
        tx::apply_tx(current_blockstamp, current_time, &gva_db, tx_hash, tx)?;
    }
    Ok(())
}
