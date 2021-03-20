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

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
pub enum Amount {
    Cents(SourceAmount),
    Uds(f64),
}

impl Default for Amount {
    fn default() -> Self {
        Self::Cents(SourceAmount::ZERO)
    }
}

impl Amount {
    pub fn to_cents(self, ud_amount: SourceAmount) -> SourceAmount {
        match self {
            Amount::Cents(sa) => sa,
            Amount::Uds(f64_) => {
                if !f64_.is_finite() || f64_ <= 0f64 {
                    SourceAmount::ZERO
                } else {
                    SourceAmount::new(
                        f64::round(ud_amount.amount() as f64 * f64_) as i64,
                        ud_amount.base(),
                    )
                }
            }
        }
    }
}
