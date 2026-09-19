"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="signin-view"><section className="signin-card"><h1>Something interrupted Glean.</h1><p>Try loading this page again. Saved work remains in your account.</p><button className="primary-button" onClick={reset}>Try again</button><p><a href="/">Return home</a></p></section></main>;
}
