import Link from "next/link";
import { Counter } from "./counter";

export default function Home() {
  return (
    <main>
      <h1 data-testid="headline">Sample store v1</h1>
      <img src="/logo.svg" alt="Sample logo" width="48" height="48" />
      <Counter />
      <p>
        <Link href="/about">About us</Link>
      </p>
      <form action="/api/echo" method="post">
        <input name="message" defaultValue="hello from the form" aria-label="Message" />
        <button type="submit">Send form</button>
      </form>
    </main>
  );
}
