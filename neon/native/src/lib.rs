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

mod crypto;
mod wot;

use neon::{prelude::*, register_module};

fn into_neon_res<'c, C: Context<'c>, T, S: AsRef<str>>(
    context: &mut C,
    rust_result: Result<T, S>,
) -> NeonResult<T> {
    match rust_result {
        Ok(value) => Ok(value),
        Err(e) => context.throw_error(e),
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
    cx.export_class::<crate::wot::JsWoT>("Wot")?;
    Ok(())
});
