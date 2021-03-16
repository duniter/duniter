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

#[derive(async_graphql::InputObject, Clone, Copy, Default)]
pub(crate) struct TimeInterval {
    pub(crate) from: Option<u64>,
    pub(crate) to: Option<u64>,
}

#[derive(async_graphql::InputObject)]
pub(crate) struct TxIssuer {
    /// Account script (default is a script needed all provided signers)
    pub(crate) script: Option<String>,
    /// Signers
    #[graphql(validator(ListMinLength(length = "1")))]
    pub(crate) signers: Vec<String>,
    /// XHX codes needed to unlock funds
    #[graphql(validator(ListMinLength(length = "1")))]
    pub(crate) codes: Option<Vec<String>>,
    /// Amount
    #[graphql(validator(IntGreaterThan(value = "0")))]
    pub(crate) amount: i32,
}

#[derive(async_graphql::InputObject)]
pub(crate) struct TxRecipient {
    /// Amount
    #[graphql(validator(IntGreaterThan(value = "0")))]
    pub(crate) amount: i32,
    /// Account script
    pub(crate) script: String,
}

#[derive(Clone, Copy, async_graphql::Enum, Eq, PartialEq)]
pub(crate) enum UdsFilter {
    All,
    Unspent,
}
impl Default for UdsFilter {
    fn default() -> Self {
        UdsFilter::All
    }
}
