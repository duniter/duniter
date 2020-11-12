use crate::*;

pub trait KeyAsBytes {
    fn as_bytes<T, F: FnMut(&[u8]) -> T>(&self, f: F) -> T;
    fn fill_bytes_size(&self) -> Option<usize> {
        None
    }
    fn fill_bytes(&self, _: &mut [u8]) {
        unimplemented!()
    }
}
pub trait ValueAsBytes {
    fn as_bytes<T, F: FnMut(&[u8]) -> Result<T, KvError>>(&self, f: F) -> Result<T, KvError>;
    fn fill_bytes_size(&self) -> Option<usize> {
        None
    }
    fn fill_bytes(&self, _: &mut [u8]) {
        unimplemented!()
    }
}

impl KeyAsBytes for () {
    fn as_bytes<T, F: FnMut(&[u8]) -> T>(&self, mut f: F) -> T {
        f(&[])
    }
    fn fill_bytes_size(&self) -> Option<usize> {
        Some(0)
    }
    fn fill_bytes(&self, _: &mut [u8]) {}
}
impl ValueAsBytes for () {
    fn as_bytes<T, F: FnMut(&[u8]) -> Result<T, KvError>>(&self, mut f: F) -> Result<T, KvError> {
        f(&[])
    }
    fn fill_bytes_size(&self) -> Option<usize> {
        Some(0)
    }
    fn fill_bytes(&self, _: &mut [u8]) {}
}

impl KeyAsBytes for String {
    fn as_bytes<T, F: FnMut(&[u8]) -> T>(&self, mut f: F) -> T {
        f(self.as_bytes())
    }
    fn fill_bytes_size(&self) -> Option<usize> {
        Some(self.len())
    }
    fn fill_bytes(&self, buffer: &mut [u8]) {
        buffer.copy_from_slice(self.as_bytes())
    }
}
impl ValueAsBytes for String {
    fn as_bytes<T, F: FnMut(&[u8]) -> Result<T, KvError>>(&self, mut f: F) -> Result<T, KvError> {
        f(self.as_bytes())
    }
    fn fill_bytes_size(&self) -> Option<usize> {
        Some(self.len())
    }
    fn fill_bytes(&self, buffer: &mut [u8]) {
        buffer.copy_from_slice(self.as_bytes())
    }
}

impl<T> ValueAsBytes for Vec<T>
where
    T: zerocopy::AsBytes,
{
    fn as_bytes<D, F: FnMut(&[u8]) -> Result<D, KvError>>(&self, mut f: F) -> Result<D, KvError> {
        use zerocopy::AsBytes as _;
        f((&self[..]).as_bytes())
    }
    fn fill_bytes_size(&self) -> Option<usize> {
        Some(self.len() * std::mem::size_of::<T>())
    }
    fn fill_bytes(&self, buffer: &mut [u8]) {
        use zerocopy::AsBytes as _;
        buffer.copy_from_slice((&self[..]).as_bytes())
    }
}

macro_rules! impl_as_bytes_for_smallvec {
    ($($N:literal),*) => {$(
        impl<T> ValueAsBytes for SmallVec<[T; $N]>
        where
            T: zerocopy::AsBytes,
        {
            fn as_bytes<D, F: FnMut(&[u8]) -> Result<D, KvError>>(&self, mut f: F) -> Result<D, KvError> {
                use zerocopy::AsBytes as _;
                f((&self[..]).as_bytes())
            }
            fn fill_bytes_size(&self) -> Option<usize> { Some(self.len() * std::mem::size_of::<T>()) }
            fn fill_bytes(&self, buffer: &mut [u8]) {
                use zerocopy::AsBytes as _;
                buffer.copy_from_slice((&self[..]).as_bytes())
            }
        }
    )*};
}
impl_as_bytes_for_smallvec!(1, 2, 4, 8, 16, 32, 64);

impl<T> ValueAsBytes for BTreeSet<T>
where
    T: zerocopy::AsBytes + Copy,
{
    fn as_bytes<D, F: FnMut(&[u8]) -> Result<D, KvError>>(&self, mut f: F) -> Result<D, KvError> {
        use zerocopy::AsBytes as _;
        f((&SmallVec::<[T; 32]>::from_iter(self.iter().copied())[..]).as_bytes())
    }
}

impl<T> ValueAsBytes for HashSet<T>
where
    T: zerocopy::AsBytes + Copy,
{
    fn as_bytes<D, F: FnMut(&[u8]) -> Result<D, KvError>>(&self, mut f: F) -> Result<D, KvError> {
        use zerocopy::AsBytes as _;
        f((&SmallVec::<[T; 32]>::from_iter(self.iter().copied())[..]).as_bytes())
    }
}

macro_rules! impl_as_bytes_for_numbers {
    ($($T:ty),*) => {$(
        impl KeyAsBytes for $T {
            fn as_bytes<T, F: FnMut(&[u8]) -> T>(&self, mut f: F) -> T {
                f(&self.to_le_bytes()[..])
            }
        }
        impl ValueAsBytes for $T {
            fn as_bytes<T, F: FnMut(&[u8]) -> Result<T, KvError>>(&self, mut f: F) -> Result<T, KvError> {
                f(&self.to_le_bytes()[..])
            }
        }
    )*};
}

impl_as_bytes_for_numbers!(
    usize, u8, u16, u32, u64, u128, isize, i8, i16, i32, i64, i128, f32, f64
);
