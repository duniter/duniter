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

mod members_count;
mod prepare_simple_payment;

use crate::*;

#[derive(Debug, PartialEq)]
pub(super) struct ExecReqTypeError(pub(super) String);

impl<E> From<E> for ExecReqTypeError
where
    E: ToString,
{
    fn from(e: E) -> Self {
        Self(e.to_string())
    }
}

pub(super) async fn execute_req_type(
    bca_executor: &BcaExecutor,
    req_type: BcaReqTypeV0,
    _is_whitelisted: bool,
) -> Result<BcaRespTypeV0, ExecReqTypeError> {
    match req_type {
        BcaReqTypeV0::MembersCount => members_count::exec_req_members_count(bca_executor).await,
        BcaReqTypeV0::PrepareSimplePayment(params) => {
            prepare_simple_payment::exec_req_prepare_simple_payment(bca_executor, params).await
        }
        BcaReqTypeV0::Ping => Ok(BcaRespTypeV0::Pong),
    }
}
