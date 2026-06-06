import { useMemo } from "react";
import { computePositionMetrics } from "../../utils/computePositionMetrics";
import PositionHolding from "../PositionHolding/PositionHolding";

export default function PositionStatRow({ position, chartData, isLoading }) {
  const metrics = useMemo(
    () => computePositionMetrics(position, chartData),
    [position, chartData],
  );

  return (
    <PositionHolding
      position={position}
      metrics={metrics}
      isLoading={isLoading}
      showTodayGainLoss
    />
  );
}
