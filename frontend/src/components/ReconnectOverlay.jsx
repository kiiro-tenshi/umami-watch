export default function ReconnectOverlay({ reconnecting }) {
  if (!reconnecting) return null;
  return (
    <div className='fixed top-14 left-0 right-0 z-50 bg-amber-100/95 border-b border-amber-300 text-amber-900 text-sm md:text-base font-bold text-center py-2.5 flex items-center justify-center gap-3 shadow-md backdrop-blur-sm'>
      <div className='w-4 h-4 border-2 border-amber-600 border-t-transparent rounded-full animate-spin' />
      Reconnecting to watch party...
      <span className="text-xs font-normal ml-2 hidden sm:inline">(Server cold start, usually takes 3-5s)</span>
    </div>
  );
}
