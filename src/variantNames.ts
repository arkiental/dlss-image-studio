export function uniqueVariantName(
  requested: string,
  fallback: string,
  existing: { name: string }[],
) {
  const used = new Set(
    existing.map((item) => item.name.trim().toLocaleLowerCase()),
  );
  const available = (value: string) => !used.has(value.toLocaleLowerCase());
  const name = requested.trim();
  if (!name) {
    let number = 1;
    while (!available(`${fallback} ${number}`)) number++;
    return `${fallback} ${number}`;
  }
  if (available(name)) return name;
  const suffix = name.match(/^(.*?) \((\d+)\)$/);
  const base = suffix?.[1] || name;
  let number = suffix ? BigInt(suffix[2]) + 1n : 2n;
  if (number < 2n) number = 2n;
  while (!available(`${base} (${number})`)) number++;
  return `${base} (${number})`;
}
