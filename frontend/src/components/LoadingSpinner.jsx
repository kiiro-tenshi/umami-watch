export default function LoadingSpinner({ fullScreen }) {
  const spinner = (
    <div className="flex flex-col items-center justify-center gap-3">
      <div className="w-10 h-10 border-4 border-surface-raised border-t-accent-purple rounded-full animate-spin shadow-sm"></div>
      <p className="text-secondary font-semibold animate-pulse">Loading...</p>
    </div>
  );

  if (fullScreen) {
    return <div className="min-h-screen flex items-center justify-center bg-page">{spinner}</div>;
  }
  return <div className="p-8 flex items-center justify-center w-full">{spinner}</div>;
}
