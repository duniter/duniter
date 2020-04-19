export async function filterAsync<T>(
  arr: T[],
  filter: (t: T) => Promise<boolean>
) {
  const filtered: T[] = [];
  await Promise.all(
    arr.map(async (t) => {
      if (await filter(t)) {
        filtered.push(t);
      }
    })
  );
  return filtered;
}
