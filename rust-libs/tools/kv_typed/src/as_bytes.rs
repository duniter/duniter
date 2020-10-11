use crate::*;

pub trait KeyAsBytes {
    fn as_bytes<T, F: FnMut(&[u8]) -> T>(&self, f: F) -> T;
}
pub trait ValueAsBytes {
    fn as_bytes<T, F: FnMut(&[u8]) -> Result<T, KvError>>(&self, f: F) -> Result<T, KvError>;
}

impl KeyAsBytes for String {
    fn as_bytes<T, F: FnMut(&[u8]) -> T>(&self, mut f: F) -> T {
        f(self.as_bytes())
    }
}
impl ValueAsBytes for String {
    fn as_bytes<T, F: FnMut(&[u8]) -> Result<T, KvError>>(&self, mut f: F) -> Result<T, KvError> {
        f(self.as_bytes())
    }
}

macro_rules! impl_as_bytes_for_numbers {
    ($($T:ty),*) => {$(
        impl KeyAsBytes for $T {
            fn as_bytes<T, F: FnMut(&[u8]) -> T>(&self, mut f: F) -> T {
                f(&self.to_be_bytes()[..])
            }
        }
        impl ValueAsBytes for $T {
            fn as_bytes<T, F: FnMut(&[u8]) -> Result<T, KvError>>(&self, mut f: F) -> Result<T, KvError> {
                f(&self.to_be_bytes()[..])
            }
        }
    )*};
}

impl_as_bytes_for_numbers!(usize, u8, u16, u32, u64, u128, i8, i16, i32, i64, i128, f32, f64);
