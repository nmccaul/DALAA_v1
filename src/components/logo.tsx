import Image from "next/image";

/** The lockup, swapping to the dark-mode artwork with the system theme. `compact` shows only the mark on phones. */
export function Logo({ height = 28, compact = false }: { height?: number; compact?: boolean }) {
  const width = Math.round((height * 1097) / 310);
  const markWidth = Math.round((height * 330) / 294);
  const lockup = compact ? "hidden sm:block sm:dark:hidden" : "dark:hidden";
  const darkLockup = compact ? "hidden sm:dark:block" : "hidden dark:block";
  return (
    <>
      {compact && (
        <>
          <Image src="/brand/dalaa-mark.png" alt="DALAA" width={markWidth} height={height} priority className="sm:hidden dark:hidden" />
          <Image src="/brand/dalaa-mark-dark.png" alt="DALAA" width={markWidth} height={height} priority className="hidden dark:block dark:sm:hidden" />
        </>
      )}
      <Image src="/brand/dalaa-lockup.png" alt="DALAA" width={width} height={height} priority className={lockup} />
      <Image src="/brand/dalaa-lockup-dark.png" alt="DALAA" width={width} height={height} priority className={darkLockup} />
    </>
  );
}
