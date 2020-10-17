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

#![deny(
    clippy::unwrap_used,
    missing_debug_implementations,
    missing_copy_implementations,
    trivial_casts,
    trivial_numeric_casts,
    unsafe_code,
    unstable_features,
    unused_import_braces
)]

mod crypto;
mod event_emitter;
mod logger;
mod server;
mod transaction;
mod wot;

use neon::{prelude::*, register_module};

fn into_neon_res<'c, C: Context<'c>, T, E: std::fmt::Display>(
    context: &mut C,
    rust_result: Result<T, E>,
) -> NeonResult<T> {
    match rust_result {
        Ok(value) => Ok(value),
        Err(e) => context.throw_error(format!("{}", e)),
    }
}

register_module!(mut cx, {
    cx.export_function("generateRandomSeed", crate::crypto::generate_random_seed)?;
    cx.export_function(
        "seedToSecretKey",
        crate::crypto::seed_to_expanded_base58_secret_key,
    )?;
    cx.export_function("sha256", crate::crypto::sha256)?;
    cx.export_function("verify", crate::crypto::verify)?;
    cx.export_class::<crate::crypto::JsKeyPair>("Ed25519Signator")?;
    cx.export_class::<crate::event_emitter::JsEventEmitter>("RustEventEmitter")?;
    cx.export_class::<crate::logger::JsLogger>("RustLogger")?;
    cx.export_class::<crate::server::JsServer>("RustServer")?;
    cx.export_function(
        "rawTxParseAndVerify",
        crate::transaction::raw_tx_parse_and_verify,
    )?;
    cx.export_function(
        "sourceIsUnlockable",
        crate::transaction::source_is_unlockable,
    )?;
    cx.export_function(
        "txsInputsAreUnlockable",
        crate::transaction::txs_inputs_are_unlockable,
    )?;
    cx.export_function("txVerify", crate::transaction::tx_verify)?;
    cx.export_class::<crate::wot::JsWoT>("Wot")?;
    Ok(())
});
