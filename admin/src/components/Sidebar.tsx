"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

interface NavItem {
  label: string;
  href: string;
  icon: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    title: "Overview",
    items: [{ label: "Dashboard", href: "/", icon: "\u25A3" }],
  },
  {
    title: "Configuration",
    items: [
      { label: "Providers", href: "/providers", icon: "\u2601" },
      { label: "Apps", href: "/apps", icon: "\u25A1" },
      { label: "Credentials", href: "/credentials", icon: "\u26BF" },
      { label: "OAuth Flows", href: "/oauth", icon: "\u21C4" },
    ],
  },
  {
    title: "Security",
    items: [
      { label: "Firewall Rules", href: "/firewall", icon: "\u26E8" },
      { label: "Registry Rules", href: "/registry", icon: "\u2630" },
    ],
  },
  {
    title: "Monitoring",
    items: [
      { label: "Token Usage", href: "/usage", icon: "\u2261" },
      { label: "Request Logs", href: "/logs", icon: "\u25CE" },
    ],
  },
  {
    title: "Tools",
    items: [
      { label: "Mock & Capture", href: "/mocks", icon: "\u29C9" },
      { label: "ENV Generator", href: "/env-generator", icon: "\u2699" },
      { label: "Settings", href: "/settings", icon: "\u2738" },
    ],
  },
];

function isActiveRoute(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname === href || pathname.startsWith(href + "/");
}

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    new Set()
  );

  function toggleSection(title: string) {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(title)) {
        next.delete(title);
      } else {
        next.add(title);
      }
      return next;
    });
  }

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-[250px] flex-col border-r border-sidebar-border bg-sidebar-bg">
      {/* App Title */}
      <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-sidebar-border px-5">
        <span className="text-lg text-indigo-400">&#x2B22;</span>
        <h1 className="text-base font-semibold tracking-tight text-zinc-100">
          API Proxy Admin
        </h1>
      </div>

      {/* Navigation */}
      <nav className="sidebar-scroll flex-1 overflow-y-auto px-3 py-4">
        {navSections.map((section) => {
          const isCollapsed = collapsedSections.has(section.title);

          return (
            <div key={section.title} className="mb-3">
              {/* Section Header */}
              <button
                onClick={() => toggleSection(section.title)}
                className="mb-1 flex w-full items-center justify-between rounded px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 transition-colors hover:text-zinc-300"
              >
                <span>{section.title}</span>
                <span
                  className={`text-[10px] transition-transform duration-200 ${
                    isCollapsed ? "-rotate-90" : ""
                  }`}
                >
                  &#9662;
                </span>
              </button>

              {/* Section Items */}
              {!isCollapsed && (
                <ul className="space-y-0.5">
                  {section.items.map((item) => {
                    const active = isActiveRoute(pathname, item.href);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          className={`nav-item flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium ${
                            active
                              ? "bg-indigo-600/15 text-indigo-400"
                              : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"
                          }`}
                        >
                          <span
                            className={`flex h-5 w-5 items-center justify-center text-sm ${
                              active ? "text-indigo-400" : "text-zinc-500"
                            }`}
                          >
                            {item.icon}
                          </span>
                          {item.label}
                          {active && (
                            <span className="ml-auto h-1.5 w-1.5 rounded-full bg-indigo-400" />
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="shrink-0 border-t border-sidebar-border px-5 py-3">
        <p className="text-[11px] text-zinc-600">v1.0.0</p>
      </div>
    </aside>
  );
}
