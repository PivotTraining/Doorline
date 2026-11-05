// A read for a table that may not exist yet.
//
// The client ships independently of its migrations, so a deployed build can
// reach a database that has not run the migration adding a table it knows
// about. supabase-js RESOLVES with `{ data, error }` on a rejected query
// rather than throwing, so an un-handled missing table does not blow up --
// it quietly returns an error object that the caller then treats as data.
//
// loadAll() deliberately fails the whole hydrate when a core table errors,
// because "RLS denied" or "migration missing" must never be mistaken for
// "this company has no doors". That is right for core tables and wrong for
// ones that are legitimately absent before their migration runs, so those
// go through here instead: they degrade to no rows and report `absent`, and
// the caller uses that to decide whether the feature is available at all.
export function optionalRead(promise) {
  return Promise.resolve(promise).then(
    (r) => (r && r.error ? { data: [], error: null, absent: true } : r),
    () => ({ data: [], error: null, absent: true })
  );
}
