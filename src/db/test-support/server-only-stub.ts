/**
 * `server-only` throws outside a React Server Component graph, which is every vitest
 * run. Aliased in vitest.config.mts so a module that imports it (identity-queries) can
 * be tested; the marker still does its real job in the Next build.
 */
export {};
