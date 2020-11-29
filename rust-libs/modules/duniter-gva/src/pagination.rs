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

#[derive(Clone, Copy, async_graphql::Enum, Eq, PartialEq)]
pub(crate) enum Order {
    /// Ascending order
    Asc,
    /// Decreasing order
    Desc,
}
impl Default for Order {
    fn default() -> Self {
        Order::Asc
    }
}

#[derive(Default, async_graphql::InputObject)]
pub(crate) struct PaginationWithStrCursor {
    /// Identifier of the 1st desired element (of the last one in descending order)
    cursor: Option<String>,
    ord: Order,
    page_size: Option<u32>,
}

#[derive(Clone, Copy, Default, async_graphql::InputObject)]
pub(crate) struct PaginationWithIntCursor {
    cursor: Option<u32>,
    ord: Order,
    page_size: Option<u32>,
}
impl PaginationWithIntCursor {
    pub(crate) fn convert_to_page_info(self) -> duniter_dbs_read_ops::PageInfo<u32> {
        duniter_dbs_read_ops::PageInfo::new(
            self.cursor,
            self.ord == Order::Asc,
            self.page_size.map(|n| n as usize),
        )
    }
}
