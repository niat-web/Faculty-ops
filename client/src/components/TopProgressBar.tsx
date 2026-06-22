import { useEffect, useState } from "react";
import { progress } from "../progress";

// Global top loading bar — a thin 3px indeterminate gradient that slides left→right while any
// request/route is loading, then fades out. Driven by the in-flight `progress` store.
export default function TopProgressBar() {
  const [on, setOn] = useState(false);
  useEffect(() => progress.subscribe(setOn), []);
  return (
    <div className="global-loader" style={{ opacity: on ? 1 : 0 }}>
      <div className="global-loader__bar" />
    </div>
  );
}
