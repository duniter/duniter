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
pub struct ColInner<BC: BackendCol, E: EventTrait> {
    pub(crate) backend_col: BC,
    subscribers: ColSubscribers<E>,
}

impl<BC: BackendCol, E: EventTrait> ColInner<BC, E> {
    pub(crate) fn new(backend_col: BC) -> (Self, SubscriptionsSender<E>) {
        let subscribers = ColSubscribers::<E>::default();
        let subscription_sender = subscribers.get_subscription_sender();

        (
            ColInner {
                backend_col,
                subscribers,
            },
            subscription_sender,
        )
    }
    pub(crate) fn notify_subscribers(&mut self, events: Events<E>) {
        // Add new subscribers, notify all subscribers them prune died subscribers
        self.subscribers.add_new_subscribers();
        let died_subscribers = self.subscribers.notify_subscribers(Arc::new(events));
        self.subscribers.prune_subscribers(died_subscribers);
    }
}
