/** Skeletons at the same heights as the dashboard content (§13.5: no spinners). */
export default function PortalLoading() {
  const box = "bg-cream-200/70 animate-pulse rounded-lg";
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading">
      <div className="space-y-3">
        <div className={`${box} h-3 w-20`} />
        <div className={`${box} h-9 w-72`} />
        <div className={`${box} h-4 w-96 max-w-full`} />
        <div className={`${box} h-6 w-48 rounded-full`} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`${box} h-[132px]`} />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <div className={`${box} h-[420px] xl:col-span-2`} />
        <div className="space-y-6">
          <div className={`${box} h-[200px]`} />
          <div className={`${box} h-[196px]`} />
        </div>
      </div>
      <div className={`${box} h-[132px]`} />
    </div>
  );
}
