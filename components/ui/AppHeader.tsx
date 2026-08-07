"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import styles from "./foundation.module.css";

type AppHeaderProps = {
  displayName?: string;
};

function isActivePath(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/" || pathname.startsWith("/vehicle/");
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppHeader({ displayName }: AppHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const menuRootRef = useRef<HTMLDivElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const accountLabel = displayName?.trim() || "Account";

  useEffect(() => {
    if (!isOpen) return;

    const focusTimer = window.setTimeout(() => {
      const menuItems = menuPanelRef.current?.querySelectorAll<HTMLElement>("a, button");
      const firstVisibleItem = menuItems
        ? Array.from(menuItems).find((item) => item.offsetParent !== null)
        : undefined;
      firstVisibleItem?.focus();
    }, 0);

    function handlePointerDown(event: PointerEvent) {
      if (!menuRootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;

      event.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  function toggleMenu() {
    if (isOpen) {
      setIsOpen(false);
      triggerRef.current?.focus();
      return;
    }

    setIsOpen(true);
  }

  async function signOut() {
    setIsSigningOut(true);
    await supabase.auth.signOut();
    router.replace("/login");
  }

  function navigationLink(href: string, label: string, mobileOnly = false) {
    const active = isActivePath(pathname, href);

    return (
      <Link
        href={href}
        className={`${styles.appNavLink} ${active ? styles.appNavLinkActive : ""} ${
          mobileOnly ? styles.appNavMobileOnly : ""
        }`}
        aria-current={active ? "page" : undefined}
        onClick={() => setIsOpen(false)}
      >
        {label}
      </Link>
    );
  }

  return (
    <header className={styles.appHeader}>
      <div className={styles.appHeaderInner}>
        <Link href="/" className={styles.appBrand} aria-label="Digital Glovebox home">
          <span className={styles.appBrandMark} aria-hidden="true">
            DG
          </span>
          <span>Digital Glovebox</span>
        </Link>

        <nav className={styles.appDesktopNav} aria-label="Primary navigation">
          {navigationLink("/", "Vehicles")}
          {navigationLink("/ideas", "Ideas")}
        </nav>

        <div className={styles.appMenuRoot} ref={menuRootRef}>
          <button
            ref={triggerRef}
            type="button"
            className={styles.appMenuTrigger}
            aria-expanded={isOpen}
            aria-controls="app-account-navigation"
            onClick={toggleMenu}
          >
            <span className={styles.appMenuAvatar} aria-hidden="true">
              {accountLabel.charAt(0).toUpperCase()}
            </span>
            <span className={styles.appMenuLabel}>{accountLabel}</span>
            <span className={styles.appMenuChevron} aria-hidden="true">
              ▾
            </span>
          </button>

          <div
            id="app-account-navigation"
            ref={menuPanelRef}
            className={`${styles.appMenuPanel} ${isOpen ? styles.appMenuPanelOpen : ""}`}
            aria-hidden={!isOpen}
          >
            <nav className={styles.appMenuLinks} aria-label="Account and garage navigation">
              {navigationLink("/", "Vehicles", true)}
              {navigationLink("/ideas", "Ideas", true)}
              {navigationLink("/profile", "Profile")}
              {navigationLink("/members", "Garage members")}
            </nav>
            <div className={styles.appMenuDivider} />
            <button
              type="button"
              className={styles.appSignOutButton}
              disabled={isSigningOut}
              onClick={signOut}
            >
              {isSigningOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
