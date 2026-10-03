import Image from "next/image";

/** The lockup, swapping to the dark-mode artwork with the system theme. */
export function Logo({ height = 28 }: { height?: number }) {
  const width = Math.round((height * 1097) / 310);
  return (
    <>
      <Image src="/brand/dalaa-lockup.png" alt="DALAA" width={width} height={height} priority className="dark:hidden" />
      <Image src="/brand/dalaa-lockup-dark.png" alt="DALAA" width={width} height={height} priority className="hidden dark:block" />
    </>
  );
}
