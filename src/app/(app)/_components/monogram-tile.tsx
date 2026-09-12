import { monogram } from "./monogram";

/** The tile that stands in for a wallet where a bank logo would otherwise go. */
export function Monogram({ name, large }: { name: string; large?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-lg bg-black/5 font-semibold dark:bg-white/10 ${
        large ? "size-12 text-base" : "size-10 text-sm"
      }`}
    >
      {monogram(name)}
    </span>
  );
}
