import React from "react";

// Returns a value that lags behind `value` by `delay` ms. Used to throttle
// expensive filter recomputations on fast-typing search inputs.
export function useDebounce(value, delay = 250) {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}