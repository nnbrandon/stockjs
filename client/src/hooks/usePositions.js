import { useCallback, useEffect, useMemo, useState } from "react";
import { getAllPositions } from "../db";

export default function usePositions() {
  const [positions, setPositions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    const rows = await getAllPositions();
    setPositions(rows);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const positionsBySymbol = useMemo(
    () => Object.fromEntries(positions.map((p) => [p.symbol, p])),
    [positions],
  );

  return { positions, positionsBySymbol, isLoading, refresh };
}
