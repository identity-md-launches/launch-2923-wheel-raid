export function Icon({
  name,
  size = 20,
  className = "",
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const paths: Record<string, React.ReactNode> = {
    sword: (
      <>
        <path d="m14 3 7-1-1 7L8 21l-5-5L14 3Z" />
        <path d="m6 13 5 5M3 21l3-3M14 5l5 5" />
      </>
    ),
    arrow: (
      <>
        <path d="M4 12h16m-6-6 6 6-6 6" />
      </>
    ),
    external: (
      <>
        <path d="M14 3h7v7m0-7L10 14" />
        <path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5" />
      </>
    ),
    wheel: (
      <>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="2" />
        <path d="M12 3v7m0 4v7M3 12h7m4 0h7M5.7 5.7l5 5m2.6 2.6 5 5M5.7 18.3l5-5m2.6-2.6 5-5" />
      </>
    ),
    flame: (
      <path d="M12 3c1 5-3 5-2 9 2 0 4-2 4-5 5 5 6 9 3 12-5 5-13 1-12-5 0-4 4-7 7-11Z" />
    ),
    shield: (
      <>
        <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    moon: <path d="M20.5 13A9 9 0 0 1 11 3.5 9 9 0 1 0 20.5 13Z" />,
    trophy: (
      <>
        <path d="M8 3h8v8a4 4 0 0 1-8 0V3Zm4 12v6m-4 0h8M8 5H4v4c0 3 3 4 5 4m7-8h4v4c0 3-3 4-5 4" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />
      </>
    ),
    upload: (
      <>
        <path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5" />
      </>
    ),
    close: <path d="m6 6 12 12M6 18 18 6" />,
    check: <path d="m5 12 4 4L19 6" />,
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6m0-10v1" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 8V3l-3 3a8 8 0 1 0 3 11M20 8h-5" />
      </>
    ),
    wallet: (
      <>
        <path d="M20 7H5a2 2 0 0 1 0-4h13v4m2 0v14H5a2 2 0 0 1-2-2V5" />
        <path d="M20 11h-6v6h6m-3-3h.01" />
      </>
    ),
    spark: <path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z" />,
    volume: (
      <>
        <path d="m11 4-6 5H2v6h3l6 5V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />
      </>
    ),
  };
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.spark}
    </svg>
  );
}
