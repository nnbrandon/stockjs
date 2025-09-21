import React, { useEffect, useState } from "react";
import Typography from "@mui/material/Typography";
import Slider from "@mui/material/Slider";
import Box from "@mui/material/Box";
import { get52WeekStats } from "../../db";

export default function Stock52WeekRange({ symbol }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    (async () => {
      const result = await get52WeekStats(symbol);
      setStats(result);
    })();
  }, [symbol]);

  if (!stats) return <Typography>No data available</Typography>;

  return (
    <Box sx={{ width: 300 }}>
      <Typography variant="h8">52-Week Range</Typography>

      {/* Labels above the slider */}
      <Box display="flex" justifyContent="space-between">
        <Typography variant="body2">${stats.low52.toFixed(2)}</Typography>
        <Typography variant="body2">${stats.high52.toFixed(2)}</Typography>
      </Box>

      {/* Slider showing range and current price */}
      <Slider
        value={stats.current}
        min={stats.low52}
        max={stats.high52}
        aria-label="52-week range"
        sx={{
          color: "primary.main",
          "& .MuiSlider-thumb": {
            pointerEvents: "none", // make it read-only
          },
        }}
      />
    </Box>
  );
}
