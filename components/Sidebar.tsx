"use client";

import { usePathname, useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import {
  LayoutDashboard,
  Users,
  TrendingUp,
  Settings,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { useState, useEffect } from "react";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/my-progress", label: "My Progress", icon: TrendingUp },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [trainerName, setTrainerName] = useState<string>("Coach");

  useEffect(() => {
    const supabase = createBrowserSupabase();
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        const metaName = data.user.user_metadata?.full_name || data.user.user_metadata?.name;
        if (metaName && typeof metaName === "string" && metaName.trim()) {
          setTrainerName(metaName.trim());
        } else if (data.user.email) {
          const localPart = data.user.email.split("@")[0];
          setTrainerName(localPart.charAt(0).toUpperCase() + localPart.slice(1));
        }
      }
    });
  }, []);

  async function handleLogout() {
    setLoggingOut(true);
    const supabase = createBrowserSupabase();
    await supabase.auth.signOut();
    router.push("/login");
  }

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  const renderNavContent = () => (
    <div className="flex flex-col h-full justify-between">
      <div>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xl font-bold tracking-tight text-white">
              RYVOM<span className="text-amber-400">.</span>
            </div>
            <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[.2em] text-zinc-500">
              Coach OS
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="lg:hidden text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 cursor-pointer"
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="mt-8 space-y-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <button
                key={href}
                onClick={() => {
                  router.push(href);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all cursor-pointer ${
                  active
                    ? "bg-zinc-800/90 text-white font-semibold shadow-xs border border-zinc-700/50"
                    : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                }`}
              >
                <Icon
                  size={17}
                  className={active ? "text-amber-400" : "text-zinc-500"}
                />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="mt-auto pt-6 space-y-3">
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-zinc-400 hover:bg-zinc-900 hover:text-rose-400 transition-colors disabled:opacity-50 cursor-pointer"
        >
          <LogOut size={17} />
          <span>{loggingOut ? "Signing out…" : "Sign out"}</span>
        </button>
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-zinc-500">
            Coach Account
          </div>
          <div className="mt-0.5 text-xs font-semibold truncate text-zinc-200">
            {trainerName}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile hamburger menu toggle button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed top-4 left-4 z-40 rounded-xl bg-zinc-900 border border-zinc-800 p-2 lg:hidden shadow-lg hover:bg-zinc-800 cursor-pointer"
        aria-label="Open navigation"
      >
        <Menu size={20} className="text-zinc-400" />
      </button>

      {/* Mobile drawer backdrop overlay */}
      {open && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-black/70 lg:hidden backdrop-blur-xs cursor-default border-0"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Mobile slide-over drawer (< lg) */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 border-r border-zinc-800 bg-[#0c0c0f] p-5 transition-transform duration-200 lg:hidden shadow-2xl ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {renderNavContent()}
      </aside>

      {/* Desktop structural in-flow sidebar (>= lg): width 256px, flex-shrink: 0, sticky top-0 */}
      <aside className="hidden lg:flex flex-col w-64 shrink-0 h-screen sticky top-0 border-r border-zinc-800/90 bg-[#0c0c0f] p-5 z-20">
        {renderNavContent()}
      </aside>
    </>
  );
}
