export default function PassportNotFound() {
  return (
    <main className="live-shell">
      <a href="/live">Live registry</a>
      <h1>Passport not found</h1>
      <p>Check the chain, registry address, passport type, and record ID. New records may still be awaiting the configured confirmation depth.</p>
    </main>
  );
}
