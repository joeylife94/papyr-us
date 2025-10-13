import { http } from './lib/http';

// Monkey-patch global fetch to go through our wrapper
const originalFetch = window.fetch.bind(window);
(window as any).__ORIGINAL_FETCH__ = originalFetch;

window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  // Use wrapper for all requests; the wrapper calls the real fetch under the hood
  return http(input, { ...init });
};

// Provide a way to restore if needed (debug)
(window as any).__restoreFetch = () => {
  window.fetch = originalFetch;
};
