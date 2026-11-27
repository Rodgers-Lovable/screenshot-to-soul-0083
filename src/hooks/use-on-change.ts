import { useState } from "react";

/**
 * Runs `onChange` during render when `value` changes, so state can be reset
 * without an effect and an extra render. Not called on the first render.
 */
export function useOnChange<T>(value: T, onChange: (value: T) => void) {
  const [prev, setPrev] = useState(value);
  if (!Object.is(prev, value)) {
    setPrev(value);
    onChange(value);
  }
}
