use crate::*;

pub trait FromBytes: Sized {
    type Err: Error;

    /// Create Self from bytes.
    fn from_bytes(bytes: &[u8]) -> Result<Self, Self::Err>;
}

macro_rules! impl_from_bytes_for_numbers {
    ($($T:ty),*) => {$(
        impl FromBytes for $T {
            type Err = std::array::TryFromSliceError;

            fn from_bytes(bytes: &[u8]) -> Result<Self, Self::Err> {
                Ok(<$T>::from_be_bytes(bytes.try_into()?))
            }
        }
    )*};
}

impl_from_bytes_for_numbers!(usize, u8, u16, u32, u64, u128, i8, i16, i32, i64, i128, f32, f64);
