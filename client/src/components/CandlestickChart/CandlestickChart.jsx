import { useEffect, useRef } from "react";
import { debounce } from "lodash";
import { Chart } from "./d3/Chart";
import styles from "./CandlestickChart.module.css";

export default function CandlestickChart({ chartData }) {
  const chart = useRef(null);

  useEffect(() => {
    const svgElement = document.getElementById("container");
    if (!svgElement) {
      return;
    }

    const drawChart = () => {
      while (svgElement.firstChild) {
        svgElement.removeChild(svgElement.firstChild);
      }
      const svgRect = svgElement.getBoundingClientRect();
      chart.current = new Chart({
        chartData,
        height: svgRect.height / 1.1,
        width: svgRect.width / 1.08,
      });
    };

    const handleResize = () => {
      drawChart();
    };

    const debounceResize = debounce(handleResize, 150);

    drawChart();

    window.addEventListener("resize", debounceResize);

    return () => {
      window.removeEventListener("resize", debounceResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartData]);

  return <svg id="container" className={styles.container} />;
}
