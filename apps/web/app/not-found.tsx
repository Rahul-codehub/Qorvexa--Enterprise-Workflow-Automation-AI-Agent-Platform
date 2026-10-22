
export const dynamic = "force-static";

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        textAlign: "center",
      }}
    >
      <p>QORVEXA / 404</p>

      <h1>Page not found</h1>

      <p>
        The page you requested does not exist or may have been moved.
      </p>

      <a href="/">Return to the Qorvexa homepage</a>
    </main>
  );
}
