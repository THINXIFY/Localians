"use client";

import { useState } from "react";

export function Counter() {
  const [count, setCount] = useState(0);
  const [time, setTime] = useState(null);
  return (
    <div>
      <button type="button" onClick={() => setCount((c) => c + 1)}>
        Clicked {count} times
      </button>
      <button
        type="button"
        onClick={async () => {
          const res = await fetch("/api/time");
          setTime((await res.json()).source);
        }}
      >
        Call API
      </button>
      {time ? <p data-testid="api-result">API says: {time}</p> : null}
    </div>
  );
}
