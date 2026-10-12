/** Skeleton for every ops screen: page header, a row of pills, then a table of rows. */
export default function AdminLoading() {
  const box = "bg-sunken/70 animate-pulse rounded-lg";
  return (
    <div className="space-y-6" role="status" aria-busy="true" aria-label="Loading">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-3">
          <div className={`${box} h-3 w-20`} />
          <div className={`${box} h-9 w-64`} />
          <div className={`${box} h-4 w-80 max-w-full`} />
        </div>
        <div className="flex gap-2">
          <div className={`${box} h-6 w-20 rounded-full`} />
          <div className={`${box} h-6 w-20 rounded-full`} />
          <div className={`${box} h-6 w-20 rounded-full`} />
        </div>
      </div>
      <div className="border-border bg-card divide-border divide-y rounded-lg border">
        <div className="px-5 py-3">
          <div className={`${box} h-3 w-full max-w-2xl`} />
        </div>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="grid gap-4 px-5 py-4 sm:grid-cols-[1fr_1fr_1fr_6rem]">
            <div className={`${box} h-4 w-3/4`} />
            <div className={`${box} h-4 w-2/3`} />
            <div className={`${box} h-4 w-1/2`} />
            <div className={`${box} h-5 w-20 rounded-full`} />
          </div>
        ))}
      </div>
    </div>
  );
}
