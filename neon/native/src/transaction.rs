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

use crate::into_neon_res;
use dubp::common::crypto::{bases::BaseConversionError, keys::ed25519, keys::PublicKey};
use dubp::documents::transaction::{
    TransactionDocumentTrait, TransactionDocumentV10, TransactionDocumentV10Stringified,
    TransactionInputUnlocksV10,
};
use dubp::documents::{prelude::*, smallvec::SmallVec};
use dubp::documents_parser::prelude::*;
use dubp::wallet::prelude::*;
use neon::prelude::*;

pub fn raw_tx_parse_and_verify(mut cx: FunctionContext) -> JsResult<JsValue> {
    let raw_tx = cx.argument::<JsString>(0)?.value();
    let currency_opt = if let Some(arg1) = cx.argument_opt(1) {
        Some(arg1.downcast_or_throw::<JsString, _>(&mut cx)?.value())
    } else {
        None
    };

    match TransactionDocumentV10::parse_from_raw_text(&raw_tx) {
        Ok(tx) => {
            if let Err(e) = tx.verify(currency_opt.as_deref()) {
                cx.throw_error(format!("{}", e))
            } else {
                let tx_stringified = tx.to_string_object();
                Ok(neon_serde::to_value(&mut cx, &tx_stringified)?)
            }
        }
        Err(e) => cx.throw_error(format!("{}", e)),
    }
}

pub fn tx_verify(mut cx: FunctionContext) -> JsResult<JsUndefined> {
    let tx_obj = cx.argument::<JsValue>(0)?;
    let currency_opt = if let Some(arg1) = cx.argument_opt(1) {
        Some(arg1.downcast_or_throw::<JsString, _>(&mut cx)?.value())
    } else {
        None
    };

    let tx_stringified: TransactionDocumentV10Stringified =
        neon_serde::from_value(&mut cx, tx_obj)?;
    match TransactionDocumentV10::from_string_object(&tx_stringified) {
        Ok(tx) => {
            if let Err(e) = tx.verify(currency_opt.as_deref()) {
                cx.throw_error(format!("{}", e))
            } else {
                Ok(cx.undefined())
            }
        }
        Err(e) => cx.throw_error(format!("{}", e)),
    }
}

pub fn txs_inputs_are_unlockable(mut cx: FunctionContext) -> JsResult<JsBoolean> {
    let current_bc_time = cx.argument::<JsNumber>(0)?.value() as u64;
    let inputs_scripts_js = cx.argument::<JsValue>(1)?;
    let inputs_written_on_js = cx.argument::<JsValue>(2)?;
    let tx_obj = cx.argument::<JsValue>(3)?;

    let inputs_scripts_str: Vec<String> = neon_serde::from_value(&mut cx, inputs_scripts_js)?;
    let inputs_written_on: Vec<u64> = neon_serde::from_value(&mut cx, inputs_written_on_js)?;
    let tx_stringified: TransactionDocumentV10Stringified =
        neon_serde::from_value(&mut cx, tx_obj)?;

    match TransactionDocumentV10::from_string_object(&tx_stringified) {
        Ok(tx) => {
            let proofs = tx.get_inputs_unlocks();
            let tx_issuers = tx.issuers();
            for i in 0..proofs.len() {
                if !source_is_unlockable_inner(
                    current_bc_time,
                    &proofs[i],
                    inputs_written_on[i],
                    &tx_issuers,
                    &inputs_scripts_str[i],
                ) {
                    return Ok(cx.boolean(false));
                }
            }
            // All proofs are valid and **seem** useful for all inputs
            Ok(cx.boolean(true))
        }
        Err(e) => {
            // Tx malformated
            println!("{}", e);
            Ok(cx.boolean(false))
        }
    }
}

pub fn source_is_unlockable(mut cx: FunctionContext) -> JsResult<JsBoolean> {
    let current_bc_time = cx.argument::<JsNumber>(0)?.value() as u64;
    let tx_issuers_js = cx.argument::<JsValue>(1)?;
    let proofs = cx.argument::<JsString>(2)?.value();
    let source_written_on = cx.argument::<JsNumber>(3)?.value() as u64;
    let utxo_script = cx.argument::<JsString>(4)?.value();

    let tx_issuers_str: Vec<String> = neon_serde::from_value(&mut cx, tx_issuers_js)?;
    let tx_issuers_res = tx_issuers_str
        .iter()
        .map(|s| ed25519::PublicKey::from_base58(s))
        .collect::<Result<SmallVec<[ed25519::PublicKey; 1]>, BaseConversionError>>();
    let tx_issuers = into_neon_res(&mut cx, tx_issuers_res.map_err(|e| format!("{}", e)))?;

    if let Ok(proofs) = dubp::documents_parser::tx_unlock_v10_from_str(&proofs) {
        Ok(cx.boolean(source_is_unlockable_inner(
            current_bc_time,
            &proofs,
            source_written_on,
            &tx_issuers,
            &utxo_script,
        )))
    } else {
        // Proofs malformated
        Ok(cx.boolean(false))
    }
}

fn source_is_unlockable_inner(
    current_bc_time: u64,
    proofs: &TransactionInputUnlocksV10,
    source_written_on: u64,
    tx_issuers: &[ed25519::PublicKey],
    utxo_script: &str,
) -> bool {
    if let Ok(utxo_script) = dubp::documents_parser::wallet_script_from_str(&utxo_script) {
        if let Ok(unlockable_on) = SourceV10::unlockable_on(
            &tx_issuers,
            &proofs.unlocks,
            source_written_on,
            &utxo_script,
        ) {
            // All proofs are valid and **seem** useful
            // (it is too costly to determine the minimum set of proof that is strictly necessary and sufficient).
            unlockable_on <= current_bc_time
        } else {
            // Invalid or insufficient or too much proofs (to prevent spam with a lot of useless proofs).
            false
        }
    } else {
        // Invalid source, can never be consumed
        false
    }
}
