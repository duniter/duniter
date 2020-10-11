use crate::*;
#[cfg(feature = "subscription")]
use parking_lot::Mutex;

pub trait DbCollectionRw {
    type K: Key;
    type V: Value;
    type Event: EventTrait<K = Self::K, V = Self::V>;

    fn remove(&self, k: Self::K) -> KvResult<()>;
    fn upsert(&self, k: Self::K, v: Self::V) -> KvResult<()>;
}

#[derive(Debug)]
pub struct ColRw<BC: BackendCol, E: EventTrait> {
    inner: ColRo<BC, E>,
    #[cfg(feature = "subscription")]
    pending_events_receiver: Receiver<Events<E>>,
    #[cfg(feature = "subscription")]
    pending_events_sender: Sender<Events<E>>,
    #[cfg(feature = "subscription")]
    subscribers: Arc<Mutex<ColSubscribers<E>>>,
}

impl<BC: BackendCol, E: EventTrait> Clone for ColRw<BC, E> {
    fn clone(&self) -> Self {
        Self {
            inner: self.inner.clone(),
            #[cfg(feature = "subscription")]
            pending_events_receiver: self.pending_events_receiver.clone(),
            #[cfg(feature = "subscription")]
            pending_events_sender: self.pending_events_sender.clone(),
            #[cfg(feature = "subscription")]
            subscribers: self.subscribers.clone(),
        }
    }
}

impl<BC: BackendCol, E: EventTrait> DbCollectionRw for ColRw<BC, E> {
    type K = E::K;
    type V = E::V;
    type Event = E;

    fn remove(&self, k: Self::K) -> KvResult<()> {
        self.inner.inner.delete(&k)?;
        #[cfg(feature = "subscription")]
        {
            let events = smallvec::smallvec![E::remove(k)];
            self.notify_subscribers(events);
        }
        Ok(())
    }
    fn upsert(&self, k: Self::K, v: Self::V) -> KvResult<()> {
        self.inner.inner.put(&k, &v)?;
        #[cfg(feature = "subscription")]
        {
            let events = smallvec::smallvec![E::upsert(k, v)];
            self.notify_subscribers(events);
        }
        Ok(())
    }
}

impl<BC: BackendCol, E: EventTrait> ColRw<BC, E> {
    #[cfg(not(feature = "subscription"))]
    pub fn new(col_backend: BC) -> Self {
        Self {
            inner: ColRo {
                inner: col_backend,
                phantom: PhantomData,
            },
        }
    }
    #[cfg(feature = "subscription")]
    pub fn new(col_backend: BC) -> Self {
        let subscribers = ColSubscribers::<E>::default();
        let subscription_sender = subscribers.get_subscription_sender();
        let inner = ColRo {
            inner: col_backend,
            subscription_sender,
        };
        let (pending_events_sender, pending_events_receiver) = unbounded();
        Self {
            inner,
            pending_events_sender,
            pending_events_receiver,
            subscribers: Arc::new(Mutex::new(subscribers)),
        }
    }
    pub fn to_ro(&self) -> &ColRo<BC, E> {
        &self.inner
    }
    #[cfg(feature = "subscription")]
    fn notify_subscribers(&self, mut events: Events<E>) {
        if let Some(mut subscribers_guard) = self.subscribers.try_lock() {
            // Take pending events
            while let Ok(pending_events) = self.pending_events_receiver.try_recv() {
                events.extend(pending_events);
            }
            // Add new subscribers, notify all subscribers them prune died subscribers
            subscribers_guard.add_new_subscribers();
            let died_subscribers = subscribers_guard.notify_subscribers(Arc::new(events));
            subscribers_guard.prune_subscribers(died_subscribers);
        } else if !events.is_empty() {
            // Push pending events into the queue
            let _ = self.pending_events_sender.try_send(events);
        }
    }
    #[cfg(not(feature = "subscription"))]
    pub fn write_batch(&self, batch: Batch<BC, Self>) -> KvResult<()> {
        self.inner.inner.write_batch(batch.into_backend_batch())?;
        Ok(())
    }
    #[cfg(feature = "subscription")]
    pub fn write_batch(&self, batch: Batch<BC, Self>) -> KvResult<()> {
        let (backend_batch, events) = batch.into_backend_batch_and_events();
        self.inner.inner.write_batch(backend_batch)?;
        self.notify_subscribers(events);
        Ok(())
    }
}
