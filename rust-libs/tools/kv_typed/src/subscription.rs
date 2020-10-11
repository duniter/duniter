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

//! KV Typed subscription

use crate::*;

/// Subscriber
pub type Subscriber<E> = Sender<Arc<Events<E>>>;
/// Subscriptions sender
pub(crate) type SubscriptionsSender<E> = Sender<Subscriber<E>>;
/// Subscribers
pub type Subscribers<E> = std::collections::BTreeMap<usize, Subscriber<E>>;
/// New subscribers
pub type NewSubscribers<E> = SmallVec<[Subscriber<E>; 4]>;

#[derive(Debug)]
#[doc(hidden)]
pub struct ColSubscribers<E: EventTrait> {
    subscription_sender: SubscriptionsSender<E>,
    subscription_receiver: Receiver<Subscriber<E>>,
    subscribers: Subscribers<E>,
    subscriber_index: usize,
}

impl<E: EventTrait> Default for ColSubscribers<E> {
    fn default() -> Self {
        let (subscription_sender, subscription_receiver) = unbounded();
        ColSubscribers {
            subscription_sender,
            subscription_receiver,
            subscribers: std::collections::BTreeMap::new(),
            subscriber_index: 0,
        }
    }
}

impl<E: EventTrait> ColSubscribers<E> {
    pub(crate) fn get_subscription_sender(&self) -> Sender<Subscriber<E>> {
        self.subscription_sender.clone()
    }
    #[inline(always)]
    pub(crate) fn get_new_subscribers(&self) -> NewSubscribers<E> {
        if !self.subscription_receiver.is_empty() {
            let mut new_subscribers = SmallVec::new();
            while let Ok(subscriber) = self.subscription_receiver.try_recv() {
                new_subscribers.push(subscriber)
            }
            new_subscribers
        } else {
            SmallVec::new()
        }
    }
    pub(crate) fn notify_subscribers(&self, events: Arc<Events<E>>) -> Vec<usize> {
        let mut died_subscribers = Vec::with_capacity(self.subscribers.len());
        let mut unsend_events_opt = None;
        for (id, subscriber) in &self.subscribers {
            if let Err(e) = subscriber.try_send(
                unsend_events_opt
                    .take()
                    .unwrap_or_else(|| Arc::clone(&events)),
            ) {
                match e {
                    #[cfg(feature = "async")]
                    TrySendError::Closed(events_) => {
                        unsend_events_opt = Some(events_);
                        died_subscribers.push(*id);
                    }
                    #[cfg(not(feature = "async"))]
                    TrySendError::Disconnected(events_) => {
                        unsend_events_opt = Some(events_);
                        died_subscribers.push(*id);
                    }
                    TrySendError::Full(events_) => {
                        unsend_events_opt = Some(events_);
                    }
                }
            }
        }
        died_subscribers
    }
    #[inline(always)]
    pub(crate) fn add_new_subscribers(&mut self) {
        for new_subscriber in self.get_new_subscribers() {
            self.subscribers
                .insert(self.subscriber_index, new_subscriber);
            self.subscriber_index += 1;
        }
    }
    #[inline(always)]
    pub(crate) fn prune_subscribers(&mut self, died_subscribers: Vec<usize>) {
        for died_subscriber in died_subscribers {
            self.subscribers.remove(&died_subscriber);
        }
    }
}
