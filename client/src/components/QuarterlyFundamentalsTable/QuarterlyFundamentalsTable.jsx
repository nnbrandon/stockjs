import React, { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  TableSortLabel,
} from "@mui/material";
import formatShortNumber from "../../utils/formatShortNumber";
import ArrowDropUpIcon from "@mui/icons-material/ArrowDropUp";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";

export default function QuarterlyFundamentalsTable({
  quarterlyFundamentalsData,
}) {
  const [order, setOrder] = useState("desc");
  const [orderBy] = useState("date");

  const handleSort = () => {
    setOrder(order === "asc" ? "desc" : "asc");
  };

  const sortedData = [...quarterlyFundamentalsData].sort((a, b) => {
    if (order === "asc") {
      return new Date(a.date) - new Date(b.date);
    } else {
      return new Date(b.date) - new Date(a.date);
    }
  });

  const dataWithGrowth = sortedData.map((row) => {
    const previousRow = sortedData.find((r) => r.date < row.date);
    if (!previousRow) {
      return { ...row, revenueGrowth: null, netIncomeGrowth: null };
    }

    const revenueGrowth =
      previousRow?.totalRevenue === 0
        ? 0
        : ((row.totalRevenue - previousRow.totalRevenue) /
            previousRow.totalRevenue) *
          100;

    const netIncomeGrowth =
      previousRow?.netIncome === 0
        ? 0
        : ((row.netIncome - previousRow.netIncome) / previousRow.netIncome) *
          100;

    return { ...row, revenueGrowth, netIncomeGrowth };
  });

  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell sortDirection={orderBy === "date" ? order : false}>
              <TableSortLabel
                active={orderBy === "date"}
                direction={order}
                onClick={handleSort}
              >
                Date
              </TableSortLabel>
            </TableCell>
            <TableCell>Revenue</TableCell>
            <TableCell>Revenue Growth (%)</TableCell>
            <TableCell>Cost of Revenue</TableCell>
            <TableCell>Net Income</TableCell>
            <TableCell>Net Income Growth (%)</TableCell>
            <TableCell>EBIT</TableCell>
            <TableCell>EPS (Diluted)</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {dataWithGrowth.map((row) => (
            <TableRow key={row.date}>
              <TableCell>{new Date(row.date).toLocaleDateString()}</TableCell>
              <TableCell>{formatShortNumber(row.totalRevenue)}</TableCell>
              <TableCell
                sx={{
                  color:
                    row.revenueGrowth > 0
                      ? "#26a69a"
                      : row.revenueGrowth < 0
                        ? "#ef5350"
                        : "inherit",
                  fontWeight: "bold",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                {row.revenueGrowth !== null && isFinite(row.revenueGrowth) ? (
                  <>
                    {row.revenueGrowth.toFixed(2) + "%"}
                    {row.revenueGrowth > 0 && (
                      <ArrowDropUpIcon
                        fontSize="small"
                        sx={{ verticalAlign: "middle" }}
                      />
                    )}
                    {row.revenueGrowth < 0 && (
                      <ArrowDropDownIcon
                        fontSize="small"
                        sx={{ verticalAlign: "middle" }}
                      />
                    )}
                  </>
                ) : (
                  "--"
                )}
              </TableCell>
              <TableCell>{formatShortNumber(row.costOfRevenue)}</TableCell>
              <TableCell>{formatShortNumber(row.netIncome)}</TableCell>
              <TableCell
                sx={{
                  color:
                    row.netIncomeGrowth > 0
                      ? "#26a69a"
                      : row.netIncomeGrowth < 0
                        ? "#ef5350"
                        : "inherit",
                  fontWeight: "bold",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                {row.netIncomeGrowth !== null &&
                isFinite(row.netIncomeGrowth) ? (
                  <>
                    {row.netIncomeGrowth.toFixed(2) + "%"}
                    {row.netIncomeGrowth > 0 && (
                      <ArrowDropUpIcon
                        fontSize="small"
                        sx={{ verticalAlign: "middle" }}
                      />
                    )}
                    {row.netIncomeGrowth < 0 && (
                      <ArrowDropDownIcon
                        fontSize="small"
                        sx={{ verticalAlign: "middle" }}
                      />
                    )}
                  </>
                ) : (
                  "--"
                )}
              </TableCell>
              <TableCell>{formatShortNumber(row.EBIT)}</TableCell>
              <TableCell>{row.dilutedEPS}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
