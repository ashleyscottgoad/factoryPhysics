// Client-side display preferences (not gameplay state). Toggled from the admin
// page; persisted in localStorage. v1-simple — promote to a server setting if
// these ever need to be global across devices.

const SHOW_RATIOS_KEY = 'show-optimal-ratios';

export function getShowOptimalRatios(): boolean {
  try {
    return localStorage.getItem(SHOW_RATIOS_KEY) === '1';
  } catch {
    return false;
  }
}

export function setShowOptimalRatios(on: boolean): void {
  try {
    localStorage.setItem(SHOW_RATIOS_KEY, on ? '1' : '0');
  } catch {
    // ignore (private mode / storage disabled)
  }
}
