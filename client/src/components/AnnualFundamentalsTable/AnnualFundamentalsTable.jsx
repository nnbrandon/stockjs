import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Tooltip,
} from "@mui/material";
import formatShortNumber from "../../utils/formatShortNumber";
import GrowthCell from "../Fundamentals/GrowthCell";
import styles from "../PatternTable/PatternTable.module.css";

function fmtEpsCell(v) {
  return Number.isFinite(v) ? v.toFixed(2) : "—";
}

export default function AnnualFundamentalsTable({ annualFundamentalsData }) {
  const [order, setOrder] = useState("desc");
  const orderBy = "date";

  const handleSort = () => setOrder(order === "asc" ? "desc" : "asc");

  const sortedData = [...annualFundamentalsData].sort((a, b) =>
    order === "asc"
      ? new Date(a.date) - new Date(b.date)
      : new Date(b.date) - new Date(a.date),
  );

  const dataWithGrowth = sortedData.map((row) => {
    const previousRow = sortedData.find((r) => r.date < row.date);
    if (!previousRow) {
      return { ...row, revenueGrowth: null, netIncomeGrowth: null };
    }
    const revenueGrowth = previousRow.totalRevenue
      ? ((row.totalRevenue - previousRow.totalRevenue) /
          Math.abs(previousRow.totalRevenue)) *
        100
      : null;
    const netIncomeGrowth = previousRow.netIncome
      ? ((row.netIncome - previousRow.netIncome) /
          Math.abs(previousRow.netIncome)) *
        100
      : null;
    return { ...row, revenueGrowth, netIncomeGrowth };
  });

  return (
    <TableContainer>
      <Table size="small">
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
            <TableCell align="right">
              <Tooltip title="Total sales the company made this year" arrow>
                <span>Revenue</span>
              </Tooltip>
            </TableCell>
            <TableCell align="right">
              <Tooltip
                title="How much revenue grew vs. the previous year"
                arrow
              >
                <span>Revenue Growth</span>
              </Tooltip>
            </TableCell>
            <TableCell align="right">
              <Tooltip
                title="How much it cost the company to deliver its products/services"
                arrow
              >
                <span>Cost of Sales</span>
              </Tooltip>
            </TableCell>
            <TableCell align="right">
              <Tooltip
                title="Profit after all expenses — what the company actually keeps"
                arrow
              >
                <span>Profit</span>
              </Tooltip>
            </TableCell>
            <TableCell align="right">
              <Tooltip
                title="How much profit grew vs. the previous year"
                arrow
              >
                <span>Profit Growth</span>
              </Tooltip>
            </TableCell>
            <TableCell align="right">
              <Tooltip
                title="Earnings before interest and taxes — profit from core operations"
                arrow
              >
                <span>Operating Earnings</span>
              </Tooltip>
            </TableCell>
            <TableCell align="right">
              <Tooltip
                title="Earnings per share (diluted) — profit divided by total shares outstanding"
                arrow
              >
                <span>EPS</span>
              </Tooltip>
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {dataWithGrowth.map((row) => (
            <TableRow key={row.date} hover>
              <TableCell>{new Date(row.date).toLocaleDateString()}</TableCell>
              <TableCell align="right" className={styles.numericCell}>
                {formatShortNumber(row.totalRevenue)}
              </TableCell>
              <GrowthCell value={row.revenueGrowth} />
              <TableCell align="right" className={styles.numericCell}>
                {formatShortNumber(row.costOfRevenue)}
              </TableCell>
              <TableCell align="right" className={styles.numericCell}>
                {formatShortNumber(row.netIncome)}
              </TableCell>
              <GrowthCell value={row.netIncomeGrowth} />
              <TableCell align="right" className={styles.numericCell}>
                {formatShortNumber(row.EBIT)}
              </TableCell>
              <TableCell align="right" className={styles.numericCell}>
                {fmtEpsCell(row.dilutedEPS)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
