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

#[derive(Debug, Default, PartialEq)]
pub struct HashBTSetV2(pub BTreeSet<Hash>);
kv_typed::impl_value_for_btreeset_zc!(HashBTSetV2, Hash);

impl ToDumpString for HashBTSetV2 {
    fn to_dump_string(&self) -> String {
        todo!()
    }
}
