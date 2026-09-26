/* ============================================================
   Go Events Kenya — where the data lives

   These two values are meant to be public. The URL is the address
   of the database's API, and the key below identifies this app as
   an anonymous visitor. Neither one grants any access on its own:
   what a caller may read or write is decided by row-level security
   inside the database, per signed-in user.

   The secret keys — the service role key, and anything to do with
   M-Pesa — never appear in this folder. They belong in the Supabase
   dashboard as environment variables, where the browser cannot see
   them.
   ============================================================ */
window.GEK = {
  url: "https://ipnotrtqlkjqtnhxpzhh.supabase.co",
  key: "sb_publishable_t0d5269ZmoYzGxtBLVrsvQ_jZnFZTRD"
};
