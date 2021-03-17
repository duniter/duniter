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

pub mod prepare_payment;

use crate::prepare_payment::{PrepareSimplePayment, PrepareSimplePaymentResp};
use dubp::crypto::hashs::Hash;
use dubp::crypto::keys::ed25519::PublicKey;
use dubp::wallet::prelude::*;
use serde::{Deserialize, Serialize};
//use smallvec::SmallVec;

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
pub enum BcaReq {
    V0(BcaReqV0),
    _V1,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
pub struct BcaReqV0 {
    pub req_id: usize,
    pub req_type: BcaReqTypeV0,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
pub enum BcaReqTypeV0 {
    MembersCount,
    PrepareSimplePayment(PrepareSimplePayment),
    Ping,
}

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

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
pub enum BcaRespTypeV0 {
    Error(String),
    MembersCount(u64),
    PrepareSimplePayment(PrepareSimplePaymentResp),
    Pong,
}

pub type BcaResult = Vec<Result<BcaResp, ReqExecError>>;

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
pub enum ReqExecError {
    Cancelled,
    InvalidReq(String),
    Panic,
    Unknown,
}
