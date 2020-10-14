use crate::*;

pub trait DbCollectionRo: Sized {
    type BackendCol: BackendCol;
    type K: Key;
    type V: Value;
    type Event: EventTrait<K = Self::K, V = Self::V>;

    fn count(&self) -> KvResult<usize>;
    fn get(&self, k: &Self::K) -> KvResult<Option<Self::V>>;
    fn iter<R: 'static + RangeBounds<Self::K>>(
        &self,
        range: R,
    ) -> KvIter<Self::BackendCol, Self::K, Self::V>;
    #[cfg(feature = "subscription")]
    fn subscribe(&self, subscriber_sender: Subscriber<Self::Event>) -> KvResult<()>;
}

#[cfg(feature = "mock")]
mockall::mock! {
    pub ColRo<E: EventTrait> {}
    trait DbCollectionRo {
        type BackendCol = MockBackendCol;
        type K = E::K;
        type V = E::V;
        type Event = E;

        fn count(&self) -> KvResult<usize>;
        fn get(&self, k: &E::K) -> KvResult<Option<E::V>>;
        fn iter<R: 'static + RangeBounds<E::K>>(&self, range: R)
        -> KvIter<MockBackendCol, E::K, E::V>;
        #[cfg(feature = "subscription")]
        fn subscribe(&self, subscriber_sender: Subscriber<E>) -> KvResult<()>;
    }
}

#[derive(Debug)]
pub struct ColRo<BC: BackendCol, E: EventTrait> {
    pub(crate) inner: BC,
    #[cfg(not(feature = "subscription"))]
    pub(crate) phantom: PhantomData<E>,
    #[cfg(feature = "subscription")]
    pub(crate) subscription_sender: crate::subscription::SubscriptionsSender<E>,
}
impl<BC: BackendCol, E: EventTrait> Clone for ColRo<BC, E> {
    fn clone(&self) -> Self {
        Self {
            inner: self.inner.clone(),
            #[cfg(not(feature = "subscription"))]
            phantom: PhantomData,
            #[cfg(feature = "subscription")]
            subscription_sender: self.subscription_sender.clone(),
        }
    }
}
impl<BC: BackendCol, E: EventTrait> DbCollectionRo for ColRo<BC, E> {
    type BackendCol = BC;
    type K = E::K;
    type V = E::V;
    type Event = E;

    #[inline(always)]
    fn count(&self) -> KvResult<usize> {
        self.inner.count()
    }
    #[inline(always)]
    fn get(&self, k: &Self::K) -> KvResult<Option<Self::V>> {
        self.inner.get(k)
    }
    #[inline(always)]
    fn iter<R: 'static + RangeBounds<Self::K>>(
        &self,
        range: R,
    ) -> KvIter<Self::BackendCol, Self::K, Self::V> {
        let range: RangeBytes = KvIter::<BC, Self::K, Self::V>::convert_range::<R>(range);
        KvIter::new(self.inner.iter::<Self::K, Self::V>(range.clone()), range)
    }
    #[cfg(feature = "subscription")]
    #[inline(always)]
    fn subscribe(&self, subscriber_sender: Subscriber<Self::Event>) -> KvResult<()> {
        self.subscription_sender
            .try_send(subscriber_sender)
            .map_err(|_| KvError::FailToSubscribe)
    }
}

pub trait DbCollectionRoGetRef<V: ValueZc>: DbCollectionRo<V = V> {
    fn get_ref<D, F: Fn(&V::Ref) -> KvResult<D>>(
        &self,
        k: &<Self as DbCollectionRo>::K,
        f: F,
    ) -> KvResult<Option<D>>;
}

impl<V: ValueZc, BC: BackendCol, E: EventTrait<V = V>> DbCollectionRoGetRef<V> for ColRo<BC, E> {
    fn get_ref<D, F: Fn(&V::Ref) -> KvResult<D>>(&self, k: &E::K, f: F) -> KvResult<Option<D>> {
        self.inner.get_ref::<E::K, V, D, F>(k, f)
    }
}

pub trait DbCollectionRoGetRefSlice<V: ValueSliceZc>: DbCollectionRo<V = V> {
    fn get_ref_slice<D, F: Fn(&[V::Elem]) -> KvResult<D>>(
        &self,
        k: &<Self as DbCollectionRo>::K,
        f: F,
    ) -> KvResult<Option<D>>;
}

impl<V: ValueSliceZc, BC: BackendCol, E: EventTrait<V = V>> DbCollectionRoGetRefSlice<V>
    for ColRo<BC, E>
{
    fn get_ref_slice<D, F: Fn(&[V::Elem]) -> KvResult<D>>(
        &self,
        k: &E::K,
        f: F,
    ) -> KvResult<Option<D>> {
        self.inner.get_ref_slice::<E::K, V, D, F>(k, f)
    }
}
