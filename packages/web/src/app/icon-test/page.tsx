"use client";

import { cn } from "@/src/lib/general-utils";

const styles = `
@keyframes pulse-subtle {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}
@keyframes spin-slow {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@keyframes bounce-subtle {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-2px); }
}
@keyframes scale-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}
@keyframes glow {
  0%, 100% { box-shadow: 0 0 0 0 rgba(0,0,0,0.1); }
  50% { box-shadow: 0 0 8px 2px rgba(0,0,0,0.15); }
}
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
.animate-pulse-subtle { animation: pulse-subtle 2s ease-in-out infinite; }
.animate-spin-slow { animation: spin-slow 8s linear infinite; }
.animate-bounce-subtle { animation: bounce-subtle 2s ease-in-out infinite; }
.animate-scale-pulse { animation: scale-pulse 2s ease-in-out infinite; }
.animate-glow { animation: glow 2s ease-in-out infinite; }
.animate-shimmer {
  background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%);
  background-size: 200% 100%;
  animation: shimmer 2s infinite;
}
`;

function SuperglueIcon1({ size = 40 }: { size?: number }) {
  return (
    <div
      className="rounded-full bg-black dark:bg-white flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <img src="/favicon.png" alt="S" className="w-1/2 h-1/2 object-contain dark:invert" />
    </div>
  );
}

function SuperglueIcon2({ size = 40 }: { size?: number }) {
  return (
    <div
      className="rounded-full bg-white dark:bg-black border border-neutral-200 dark:border-neutral-800 flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <img src="/favicon.png" alt="S" className="w-1/2 h-1/2 object-contain" />
    </div>
  );
}

function SuperglueIcon3({ size = 40 }: { size?: number }) {
  return (
    <div
      className="rounded-full bg-gradient-to-br from-neutral-100 to-neutral-300 dark:from-neutral-800 dark:to-neutral-900 flex items-center justify-center shadow-inner"
      style={{ width: size, height: size }}
    >
      <img src="/favicon.png" alt="S" className="w-1/2 h-1/2 object-contain dark:invert" />
    </div>
  );
}

function SuperglueIcon4({ size = 40 }: { size?: number }) {
  return (
    <div
      className="rounded-full bg-black dark:bg-white flex items-center justify-center animate-pulse-subtle"
      style={{ width: size, height: size }}
    >
      <img src="/favicon.png" alt="S" className="w-1/2 h-1/2 object-contain dark:invert" />
    </div>
  );
}

function SuperglueIcon5({ size = 40 }: { size?: number }) {
  return (
    <div
      className="rounded-full bg-gradient-to-b from-black to-neutral-700 dark:from-white dark:to-neutral-300 flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <img src="/favicon.png" alt="S" className="w-1/2 h-1/2 object-contain dark:invert" />
    </div>
  );
}

function SuperglueIcon6({ size = 40 }: { size?: number }) {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <div className="absolute inset-0 rounded-full bg-black/20 dark:bg-white/20 blur-sm" />
      <div className="relative rounded-full bg-black dark:bg-white flex items-center justify-center w-full h-full">
        <img src="/favicon.png" alt="S" className="w-1/2 h-1/2 object-contain dark:invert" />
      </div>
    </div>
  );
}

function SuperglueIcon7({ size = 40 }: { size?: number }) {
  return (
    <div
      className="rounded-full border-2 border-black dark:border-white flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <img src="/favicon.png" alt="S" className="w-1/2 h-1/2 object-contain" />
    </div>
  );
}

function SuperglueIcon8({ size = 40 }: { size?: number }) {
  return (
    <div
      className="rounded-full bg-black dark:bg-white flex items-center justify-center animate-glow"
      style={{ width: size, height: size }}
    >
      <img src="/favicon.png" alt="S" className="w-1/2 h-1/2 object-contain dark:invert" />
    </div>
  );
}

function SuperglueIcon9({ size = 40 }: { size?: number }) {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <div className="absolute inset-0 rounded-full border border-neutral-300 dark:border-neutral-700 animate-spin-slow" />
      <div className="absolute inset-1 rounded-full bg-black dark:bg-white flex items-center justify-center">
        <img src="/favicon.png" alt="S" className="w-1/2 h-1/2 object-contain dark:invert" />
      </div>
    </div>
  );
}

function SuperglueIcon10({ size = 40 }: { size?: number }) {
  return (
    <div
      className="rounded-xl bg-black dark:bg-white flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <img src="/favicon.png" alt="S" className="w-1/2 h-1/2 object-contain dark:invert" />
    </div>
  );
}

function SuperglueIcon11({ size = 40 }: { size?: number }) {
  return (
    <div
      className="rounded-lg bg-gradient-to-br from-neutral-900 to-black dark:from-neutral-100 dark:to-white flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <img src="/favicon.png" alt="S" className="w-1/2 h-1/2 object-contain dark:invert" />
    </div>
  );
}

function SuperglueIcon12({ size = 40 }: { size?: number }) {
  return (
    <img
      src="/favicon.png"
      alt="S"
      className="object-contain"
      style={{ width: size * 0.6, height: size * 0.6 }}
    />
  );
}

function SuperglueIcon13({ size = 40 }: { size?: number }) {
  return (
    <img
      src="/favicon.png"
      alt="S"
      className="object-contain animate-bounce-subtle"
      style={{ width: size * 0.6, height: size * 0.6 }}
    />
  );
}

function SuperglueIcon14({ size = 40 }: { size?: number }) {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <div className="absolute inset-0 rounded-full bg-gradient-to-r from-neutral-200 via-white to-neutral-200 dark:from-neutral-800 dark:via-neutral-700 dark:to-neutral-800 animate-shimmer" />
      <div className="absolute inset-0.5 rounded-full bg-white dark:bg-black flex items-center justify-center">
        <img src="/favicon.png" alt="S" className="w-1/2 h-1/2 object-contain" />
      </div>
    </div>
  );
}

function SuperglueIcon15({ size = 40 }: { size?: number }) {
  return (
    <div className="flex items-center justify-center" style={{ width: size, height: size }}>
      <span className="font-black text-black dark:text-white" style={{ fontSize: size * 0.5 }}>
        S
      </span>
    </div>
  );
}

function SuperglueIcon16({ size = 40 }: { size?: number }) {
  return (
    <div
      className="rounded-full bg-black dark:bg-white flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <span className="font-black text-white dark:text-black" style={{ fontSize: size * 0.45 }}>
        S
      </span>
    </div>
  );
}

function SuperglueIcon17({ size = 40 }: { size?: number }) {
  return (
    <div
      className="rounded-full border-2 border-black dark:border-white flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <span className="font-black text-black dark:text-white" style={{ fontSize: size * 0.45 }}>
        S
      </span>
    </div>
  );
}

function SuperglueIcon18({ size = 40 }: { size?: number }) {
  return (
    <div
      className="rounded-full bg-gradient-to-br from-neutral-800 to-black dark:from-neutral-200 dark:to-white flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <span className="font-black text-white dark:text-black" style={{ fontSize: size * 0.45 }}>
        sg
      </span>
    </div>
  );
}

function SuperglueIcon19({ size = 40 }: { size?: number }) {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <div className="absolute inset-0 rounded-full bg-black dark:bg-white opacity-10" />
      <div className="absolute inset-0 flex items-center justify-center">
        <img src="/favicon.png" alt="S" className="w-3/5 h-3/5 object-contain" />
      </div>
    </div>
  );
}

function SuperglueIcon20({ size = 40 }: { size?: number }) {
  return (
    <div
      className="rounded-full flex items-center justify-center"
      style={{
        width: size,
        height: size,
        background: "conic-gradient(from 0deg, #000, #666, #000)",
      }}
    >
      <div
        className="rounded-full bg-white dark:bg-black flex items-center justify-center"
        style={{ width: size - 4, height: size - 4 }}
      >
        <img src="/favicon.png" alt="S" className="w-1/2 h-1/2 object-contain" />
      </div>
    </div>
  );
}

function UserIcon1({ size = 40 }: { size?: number }) {
  return (
    <div
      className="rounded-full bg-gradient-to-br from-white/80 to-white/40 dark:from-white/10 dark:to-white/5 backdrop-blur-sm border border-black/10 dark:border-white/10 flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <span
        className="font-semibold text-neutral-600 dark:text-neutral-400"
        style={{ fontSize: size * 0.35 }}
      >
        You
      </span>
    </div>
  );
}

function UserIcon2({ size = 40 }: { size?: number }) {
  return (
    <div
      className="rounded-full bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <span
        className="font-bold text-neutral-500 dark:text-neutral-500"
        style={{ fontSize: size * 0.4 }}
      >
        Y
      </span>
    </div>
  );
}

function UserIcon3({ size = 40 }: { size?: number }) {
  return (
    <div
      className="rounded-full border-2 border-neutral-300 dark:border-neutral-700 flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <span
        className="font-semibold text-neutral-400 dark:text-neutral-600"
        style={{ fontSize: size * 0.35 }}
      >
        You
      </span>
    </div>
  );
}

function UserIcon4({ size = 40 }: { size?: number }) {
  return (
    <div
      className="rounded-full bg-gradient-to-br from-neutral-50 to-neutral-200 dark:from-neutral-900 dark:to-neutral-800 flex items-center justify-center shadow-sm"
      style={{ width: size, height: size }}
    >
      <span
        className="font-bold text-neutral-600 dark:text-neutral-400"
        style={{ fontSize: size * 0.4 }}
      >
        Y
      </span>
    </div>
  );
}

function UserIcon5({ size = 40 }: { size?: number }) {
  return (
    <span
      className="font-medium text-neutral-400 dark:text-neutral-600"
      style={{ fontSize: size * 0.4 }}
    >
      You
    </span>
  );
}

function UserIcon6({ size = 40 }: { size?: number }) {
  return (
    <div
      className="rounded-xl bg-neutral-100 dark:bg-neutral-900 flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <span className="font-bold text-neutral-500" style={{ fontSize: size * 0.4 }}>
        Y
      </span>
    </div>
  );
}

function UserIcon7({ size = 40 }: { size?: number }) {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <div className="absolute inset-0 rounded-full bg-neutral-200/50 dark:bg-neutral-800/50 blur-sm" />
      <div className="relative rounded-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 flex items-center justify-center w-full h-full">
        <span className="font-semibold text-neutral-500" style={{ fontSize: size * 0.35 }}>
          You
        </span>
      </div>
    </div>
  );
}

function UserIcon8({ size = 40 }: { size?: number }) {
  return (
    <div
      className="rounded-full bg-white dark:bg-black border border-dashed border-neutral-300 dark:border-neutral-700 flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <span
        className="font-medium text-neutral-400 dark:text-neutral-600"
        style={{ fontSize: size * 0.35 }}
      >
        You
      </span>
    </div>
  );
}

function UserIcon9({ size = 40 }: { size?: number }) {
  return (
    <div
      className="rounded-full flex items-center justify-center"
      style={{
        width: size,
        height: size,
        background: "linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 100%)",
      }}
    >
      <span className="font-bold text-neutral-600" style={{ fontSize: size * 0.4 }}>
        Y
      </span>
    </div>
  );
}

function UserIcon10({ size = 40 }: { size?: number }) {
  return (
    <div
      className="rounded-full bg-transparent border border-neutral-200 dark:border-neutral-800 flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <div className="w-3/5 h-3/5 rounded-full bg-neutral-200 dark:bg-neutral-800" />
    </div>
  );
}

const superglueIcons = [
  { name: "Solid Black Circle + Favicon", component: SuperglueIcon1 },
  { name: "White Circle + Favicon", component: SuperglueIcon2 },
  { name: "Gradient Circle + Favicon", component: SuperglueIcon3 },
  { name: "Pulsing Black Circle", component: SuperglueIcon4 },
  { name: "Vertical Gradient", component: SuperglueIcon5 },
  { name: "Drop Shadow", component: SuperglueIcon6 },
  { name: "Outline Only", component: SuperglueIcon7 },
  { name: "Glowing", component: SuperglueIcon8 },
  { name: "Spinning Ring", component: SuperglueIcon9 },
  { name: "Rounded Square", component: SuperglueIcon10 },
  { name: "Rounded Square Gradient", component: SuperglueIcon11 },
  { name: "Favicon Only", component: SuperglueIcon12 },
  { name: "Favicon Bouncing", component: SuperglueIcon13 },
  { name: "Shimmer Border", component: SuperglueIcon14 },
  { name: "S Letter Only", component: SuperglueIcon15 },
  { name: "S in Circle", component: SuperglueIcon16 },
  { name: "S Outline Circle", component: SuperglueIcon17 },
  { name: "sg Initials", component: SuperglueIcon18 },
  { name: "Ghost Circle", component: SuperglueIcon19 },
  { name: "Conic Gradient Ring", component: SuperglueIcon20 },
];

const userIcons = [
  { name: "Glass + You", component: UserIcon1 },
  { name: "Muted Circle + Y", component: UserIcon2 },
  { name: "Outline + You", component: UserIcon3 },
  { name: "Gradient + Y", component: UserIcon4 },
  { name: "Text Only", component: UserIcon5 },
  { name: "Rounded Square + Y", component: UserIcon6 },
  { name: "Soft Shadow + You", component: UserIcon7 },
  { name: "Dashed Border", component: UserIcon8 },
  { name: "Light Gradient + Y", component: UserIcon9 },
  { name: "Abstract Circle", component: UserIcon10 },
];

export default function IconTestPage() {
  return (
    <div className="min-h-screen bg-background p-8">
      <style dangerouslySetInnerHTML={{ __html: styles }} />

      <h1 className="text-3xl font-bold mb-2">Icon Brainstorm v2</h1>
      <p className="text-muted-foreground mb-8">
        Black, white, grey only. Subtle animations and gradients.
      </p>

      <div className="space-y-16">
        <section>
          <h2 className="text-2xl font-semibold mb-6">Superglue Icons ({superglueIcons.length})</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
            {superglueIcons.map(({ name, component: Icon }) => (
              <div
                key={name}
                className="flex flex-col items-center gap-3 p-4 rounded-xl border border-border bg-card"
              >
                <Icon size={48} />
                <span className="text-xs text-muted-foreground text-center">{name}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-6">User Icons ({userIcons.length})</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
            {userIcons.map(({ name, component: Icon }) => (
              <div
                key={name}
                className="flex flex-col items-center gap-3 p-4 rounded-xl border border-border bg-card"
              >
                <Icon size={48} />
                <span className="text-xs text-muted-foreground text-center">{name}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-6">Chat Previews</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {superglueIcons.slice(0, 12).map(({ name: sgName, component: SgIcon }, idx) => {
              const UserIcon = userIcons[idx % userIcons.length].component;
              return (
                <div key={sgName} className="border rounded-xl p-4 bg-card">
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <UserIcon size={40} />
                      <div className="flex-1">
                        <div className="text-sm font-medium">You</div>
                        <div className="text-sm text-muted-foreground">
                          How do I connect to Salesforce?
                        </div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <SgIcon size={40} />
                      <div className="flex-1">
                        <div className="text-sm font-medium">superglue</div>
                        <div className="text-sm text-muted-foreground">
                          I can help you set up a connection...
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t text-[10px] text-muted-foreground">
                    {sgName} + {userIcons[idx % userIcons.length].name}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-6">Size Comparison</h2>
          <div className="flex items-end gap-8 flex-wrap">
            {[24, 32, 40, 48, 56].map((size) => (
              <div key={size} className="flex flex-col items-center gap-2">
                <SuperglueIcon1 size={size} />
                <span className="text-xs text-muted-foreground">{size}px</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
