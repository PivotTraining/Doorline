// Per-device theme preference (light default). Applied to <html data-theme>.
import { useSyncExternalStore } from "react";

const KEY = "doorline_theme";
let theme = localStorage.getItem(KEY) || "light";
const subs = new Set();

function apply() { document.documentElement.dataset.theme = theme; }
apply();

export function getTheme() { return theme; }
export function setTheme(t) { theme = t; localStorage.setItem(KEY, t); apply(); subs.forEach((f) => f()); }
export function toggleTheme() { setTheme(theme === "light" ? "dark" : "light"); }
export function subscribeTheme(fn) { subs.add(fn); return () => subs.delete(fn); }
export function useTheme() { useSyncExternalStore(subscribeTheme, getTheme); return theme; }
