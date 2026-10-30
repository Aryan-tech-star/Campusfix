"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main
      style={{
        maxWidth: 560,
        margin: "18vh auto",
        padding: 24,
        fontFamily: "Segoe UI, sans-serif",
      }}
    >
      <h1>We couldn’t open your workspace.</h1>
      <p>
        The CampusFix service may be restarting. Your saved maintenance records
        are safe.
      </p>
      <button
        onClick={reset}
        style={{ padding: "12px 20px", cursor: "pointer" }}
      >
        Try again
      </button>
      <p>
        <a href="/login">Return to sign in</a>
      </p>
    </main>
  );
}
