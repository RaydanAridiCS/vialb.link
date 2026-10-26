import { vi } from "vitest";

/** Controllable stand-in for the parts of `next/navigation` that client components use. */
export const router = {
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
};

const state = { pathname: "/dashboard/links", search: "" };

/** Sets the URL the next render sees, e.g. `setLocation("/dashboard/links", "tag=promo")`. */
export function setLocation(pathname: string, search = "") {
  state.pathname = pathname;
  state.search = search;
}

export function resetNavigation() {
  setLocation("/dashboard/links");
  for (const fn of Object.values(router)) fn.mockReset();
}

export const navigationModule = {
  useRouter: () => router,
  usePathname: () => state.pathname,
  useSearchParams: () => new URLSearchParams(state.search),
  redirect: vi.fn(),
  notFound: vi.fn(),
};
