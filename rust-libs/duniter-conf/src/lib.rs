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
    missing_copy_implementations,
    trivial_casts,
    trivial_numeric_casts,
    unstable_features,
    unused_import_braces
)]

pub mod gva_conf;

use crate::gva_conf::GvaConf;
use dubp::crypto::keys::ed25519::Ed25519KeyPair;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug)]
pub struct DuniterConf {
    pub gva: Option<GvaConf>,
    pub self_key_pair: Ed25519KeyPair,
    pub txs_mempool_size: usize,
}

impl Default for DuniterConf {
    fn default() -> Self {
        DuniterConf {
            gva: None,
            self_key_pair: Ed25519KeyPair::generate_random().expect("fail to gen random keypair"),
            txs_mempool_size: 0,
        }
    }
}

/// Duniter mode
#[derive(Clone, Copy, Debug)]
#[non_exhaustive]
pub enum DuniterMode {
    Start,
    Sync,
}
