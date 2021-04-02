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

pub mod amount;
pub mod identity;
pub mod prepare_payment;
pub mod rejected_tx;
pub mod utxo;

use crate::amount::Amount;
use crate::identity::Identity;
use crate::prepare_payment::{PrepareSimplePayment, PrepareSimplePaymentResp};
use crate::utxo::Utxo;

use arrayvec::ArrayVec;
use bincode::Options as _;
use dubp::crypto::keys::ed25519::{PublicKey, Signature};
use dubp::wallet::prelude::*;
use dubp::{common::prelude::Blockstamp, crypto::hashs::Hash};
use serde::{Deserialize, Serialize};
use smallvec::SmallVec;
use thiserror::Error;

// Constants

pub const MAX_FIRST_UTXOS: usize = 40;

// Request

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub enum BcaReq {
    V0(BcaReqV0),
    _V1,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct BcaReqV0 {
    pub req_id: usize,
    pub req_type: BcaReqTypeV0,
}

#[allow(clippy::large_enum_variant)]
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub enum BcaReqTypeV0 {
    BalancesOfPubkeys(ArrayVec<[PublicKey; 16]>),
    FirstUtxosOfPubkeys {
        amount_target_opt: Option<Amount>,
        pubkeys: ArrayVec<[PublicKey; 16]>,
    },
    LastBlockstampOutOfForkWindow,
    MembersCount,
    PrepareSimplePayment(PrepareSimplePayment),
    ProofServerPubkey {
        challenge: [u8; 16],
    },
    Ping,
    SendTxs(Txs),
    Identities(ArrayVec<[PublicKey; 16]>),
    CurrentUd,
}

// Request types helpers

pub type Txs = SmallVec<[dubp::documents::transaction::TransactionDocumentV10; 1]>;

// Response

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
pub enum BcaResp {
    V0(BcaRespV0),
    UnsupportedVersion,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
pub struct BcaRespV0 {
    pub req_id: usize,
    pub resp_type: BcaRespTypeV0,
}

#[allow(clippy::large_enum_variant)]
#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
pub enum BcaRespTypeV0 {
    Error(String),
    Balances(ArrayVec<[Option<SourceAmount>; 16]>),
    FirstUtxosOfPubkeys(Vec<ArrayVec<[Utxo; MAX_FIRST_UTXOS]>>),
    ProofServerPubkey {
        challenge: [u8; 16],
        server_pubkey: PublicKey,
        sig: Signature,
    },
    LastBlockstampOutOfForkWindow(Blockstamp),
    MembersCount(u64),
    PrepareSimplePayment(PrepareSimplePaymentResp),
    Pong,
    RejectedTxs(Vec<rejected_tx::RejectedTx>),
    Identities(ArrayVec<[Option<Identity>; 16]>),
    CurrentUd(SourceAmount),
}

// Result and error

pub type BcaResult = Result<BcaResp, BcaReqExecError>;

#[derive(Clone, Debug, Deserialize, Error, PartialEq, Eq, Serialize)]
pub enum BcaReqExecError {
    #[error("task cancelled")]
    Cancelled,
    #[error("Invalid request: {0}")]
    InvalidReq(String),
    #[error("task panicked")]
    Panic,
    #[error("Unknown error")]
    Unknown,
}

// Bincode configuration

pub fn bincode_opts() -> impl bincode::Options {
    bincode::options()
        .with_limit(u32::max_value() as u64)
        .allow_trailing_bytes()
}
