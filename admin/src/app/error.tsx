"use client";

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main style={{ maxWidth: 480, margin: "4rem auto", padding: "0 1.25rem" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 600 }}>Something went wrong</h1>
      <p style={{ marginTop: "0.75rem", color: "#5d4b73" }}>{error.message || "Unexpected error"}</p>
      <button
        type="button"
        onClick={reset}
        style={{
          marginTop: "1.5rem",
          padding: "0.7rem 1.2rem",
          borderRadius: 999,
          border: 0,
          background: "#301b43",
          color: "#fff8f4",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Try again
      </button>
    </main>
  );
}
