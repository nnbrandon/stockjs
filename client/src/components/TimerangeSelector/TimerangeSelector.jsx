import React, { useState, useEffect } from "react";
import { FormControl, InputLabel, Select, MenuItem } from "@mui/material";

// Utility to format date as YYYY-MM-DD
const formatDate = (date) => {
  return date.toISOString().split("T")[0];
};

export default function YearSelect({ onChange }) {
  const options = [
    { value: 1, label: "Last year" },
    { value: 2, label: "Last 2 years" },
    { value: 3, label: "Last 3 years" },
    { value: 4, label: "Last 4 years" },
    { value: 5, label: "Last 5 years" },
  ];

  // Default to 1 year ago
  const [yearsAgo, setYearsAgo] = useState(1);

  const calculateRange = (numYears) => {
    const endDate = new Date(); // today
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - numYears);
    return {
      startDate: formatDate(startDate),
      endDate: formatDate(endDate),
    };
  };

  const emitChange = (numYears) => {
    const range = calculateRange(numYears);
    if (onChange) {
      onChange(range);
    }
  };

  const handleChange = (event) => {
    const newValue = event.target.value;
    setYearsAgo(newValue);
    emitChange(newValue);
  };

  // Emit default range on first render
  useEffect(() => {
    emitChange(yearsAgo);
  }, []); // run once

  return (
    <FormControl variant="outlined" size="small" style={{ minWidth: 150 }}>
      <InputLabel id="years-ago-label">Select Time Range</InputLabel>
      <Select
        labelId="years-ago-label"
        id="years-ago-select"
        value={yearsAgo}
        onChange={handleChange}
        renderValue={(selected) => {
          const option = options.find((o) => o.value === selected);
          const localRange = calculateRange(selected);
          const dateOption = {
            year: "numeric",
            month: "long",
            day: "numeric",
          };

          const dateRange = `${new Date(localRange.startDate).toLocaleDateString("en-US", dateOption)} - ${new Date(localRange.endDate).toLocaleDateString("en-US", dateOption)}`;
          return option ? `${option.label} (${dateRange})` : "";
        }}
      >
        {options.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
