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
import { useState } from "react";

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

  const nav = (
    <>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xl font-bold tracking-tight">
            RYVOM<span className="text-zinc-600">.</span>
          </div>
          <div className="mt-0.5 text-[10px] font-medium uppercase tracking-[.2em] text-zinc-600">
            Coach OS
          </div>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="lg:hidden text-zinc-500 hover:text-white"
          aria-label="Close navigation"
        >
          <X size={18} />
        </button>
      </div>

      <nav className="mt-10 space-y-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <button
            key={href}
            onClick={() => {
              router.push(href);
              setOpen(false);
            }}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive(href)
                ? "bg-zinc-800/80 text-white"
                : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300"
            }`}
          >
            <Icon size={17} />
            {label}
          </button>
        ))}
      </nav>

      <div className="absolute bottom-5 left-5 right-5 space-y-3">
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-zinc-500 hover:bg-zinc-900 hover:text-red-400 transition-colors disabled:opacity-50"
        >
          <LogOut size={17} />
          {loggingOut ? "Signing out…" : "Sign out"}
        </button>
        <div className="rounded-xl border border-zinc-800 p-3">
          <div className="text-xs text-zinc-500">Coach</div>
          <div className="mt-1 text-sm font-medium truncate">Abhishek</div>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile menu button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed top-4 left-4 z-40 rounded-xl bg-zinc-900 border border-zinc-800 p-2 lg:hidden"
        aria-label="Open navigation"
      >
        <Menu size={20} className="text-zinc-400" />
      </button>

      {/* Mobile overlay */}
      {open && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 border-r border-zinc-800 bg-[#0c0c0f] p-5 transition-transform duration-200 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {nav}
      </aside>
    </>
  );
}
