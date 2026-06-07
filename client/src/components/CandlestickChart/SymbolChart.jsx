import { useMemo } from "react";
import isNavPricedAsset from "../../utils/isNavPricedAsset";
import CandlestickChart from "./CandlestickChart";
import NavPriceChart from "./NavPriceChart";

export default function SymbolChart({ chartData, earnings = [] }) {
  const isNav = useMemo(() => isNavPricedAsset(chartData), [chartData]);

  if (isNav) {
    return <NavPriceChart chartData={chartData} />;
  }

  return <CandlestickChart chartData={chartData} earnings={earnings} />;
}
