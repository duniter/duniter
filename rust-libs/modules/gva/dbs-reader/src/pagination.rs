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

#[derive(Debug)]
pub struct PagedData<D: std::fmt::Debug> {
    pub data: D,
    pub has_previous_page: bool,
    pub has_next_page: bool,
}
impl<D: std::fmt::Debug + Default> PagedData<D> {
    pub fn empty() -> Self {
        PagedData {
            data: D::default(),
            has_previous_page: false,
            has_next_page: false,
        }
    }
}

#[derive(Debug)]
pub struct PageInfo<T> {
    pub(crate) pos: Option<T>,
    /// Order: true for ASC, false for DESC
    pub(crate) order: bool,
    pub(crate) limit_opt: Option<usize>,
}
impl<T> PageInfo<T> {
    pub fn new(pos: Option<T>, order: bool, limit_opt: Option<usize>) -> Self {
        PageInfo {
            pos,
            order,
            limit_opt,
        }
    }
    pub fn limit_opt(&self) -> Option<usize> {
        self.limit_opt
    }
    pub fn not_all(&self) -> bool {
        self.limit_opt.is_some() || self.pos.is_some()
    }
    pub fn order(&self) -> bool {
        self.order
    }
    pub fn pos(&self) -> Option<&T> {
        self.pos.as_ref()
    }
}
impl<T> Default for PageInfo<T> {
    fn default() -> Self {
        PageInfo {
            pos: None,
            order: true,
            limit_opt: None,
        }
    }
}
impl<T> Clone for PageInfo<T>
where
    T: Clone,
{
    fn clone(&self) -> Self {
        Self {
            pos: self.pos.clone(),
            order: self.order,
            limit_opt: self.limit_opt,
        }
    }
}
impl<T> Copy for PageInfo<T> where T: Copy {}

pub(crate) fn has_next_page<
    'i,
    C: 'static + std::fmt::Debug + Default + Ord,
    I: DoubleEndedIterator<Item = OwnedOrRef<'i, C>>,
>(
    mut page_cursors: I,
    last_cursor_opt: Option<C>,
    page_info: PageInfo<C>,
    page_not_reversed: bool,
) -> bool {
    if page_info.not_all() {
        if let Some(last_cursor) = last_cursor_opt {
            //println!("TMP last_cursor={:?}", last_cursor);
            if let Some(page_end_cursor) = if page_not_reversed {
                page_cursors.next_back()
            } else {
                page_cursors.next()
            } {
                //println!("TMP page_end_cursor={:?}", page_end_cursor);
                page_end_cursor.as_ref() != &last_cursor
            } else {
                page_info.pos.unwrap_or_default() < last_cursor
            }
        } else {
            false
        }
    } else {
        false
    }
}

pub(crate) fn has_previous_page<
    'i,
    C: 'static + std::fmt::Debug + Default + Ord,
    I: DoubleEndedIterator<Item = OwnedOrRef<'i, C>>,
>(
    mut page_cursors: I,
    first_cursor_opt: Option<C>,
    page_info: PageInfo<C>,
    page_not_reversed: bool,
) -> bool {
    if page_info.not_all() {
        if let Some(first_cursor) = first_cursor_opt {
            //println!("TMP first_cursor={:?}", first_cursor);
            if let Some(page_start_cursor) = if page_not_reversed {
                page_cursors.next()
            } else {
                page_cursors.next_back()
            } {
                page_start_cursor.as_ref() != &first_cursor
            } else {
                page_info.pos.unwrap_or_default() > first_cursor
            }
        } else {
            false
        }
    } else {
        false
    }
}
