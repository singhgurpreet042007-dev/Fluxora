export function CubeLoader({ size = 40 }: { size?: number }) {
  return (
    <div
      className="cube-loader"
      style={{ width: size, height: size }}
    >
      <div className="cube-face front" style={{ width: size, height: size }} />
      <div className="cube-face back" style={{ width: size, height: size }} />
      <div className="cube-face right" style={{ width: size, height: size }} />
      <div className="cube-face left" style={{ width: size, height: size }} />
      <div className="cube-face top" style={{ width: size, height: size }} />
      <div className="cube-face bottom" style={{ width: size, height: size }} />
    </div>
  );
}

export function Spinner({ size = 24 }: { size?: number }) {
  return (
    <div
      className="border-2 border-white/10 border-t-accent rounded-full animate-spin"
      style={{ width: size, height: size }}
    />
  );
}

export function FullPageLoader() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-bg-primary z-[100]">
      <div className="flex flex-col items-center gap-6">
        <div className="relative">
          <CubeLoader size={50} />
        </div>
        <p className="text-slate-400 text-sm font-body animate-fade-in">Loading Fluxora...</p>
      </div>
    </div>
  );
}
