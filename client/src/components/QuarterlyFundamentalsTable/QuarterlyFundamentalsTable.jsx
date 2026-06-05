import { useMemo, useState } from "react";
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
import {
  fmtSurprisePercent,
  surpriseClass,
} from "../EarningsDetail/EarningsDetailContent";
import styles from "../PatternTable/PatternTable.module.css";
import earningsStyles from "./QuarterlyFundamentalsTable.module.css";

// Build a lookup from quarter date → reported (earnings release) date.
function buildEarningsMap(earnings = []) {
  const map = {};
  for (const e of earnings) {
    if (e.date && e.reportedDate) {
      const key = e.date.split("T")[0];
      map[key] = e.reportedDate;
    }
  }
  return map;
}

function formatEarningsDate(isoString) {
  if (!isoString) return null;
  const d = new Date(isoString);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtEpsCell(v) {
  return Number.isFinite(v) ? v.toFixed(2) : "—";
}

function SurpriseCell({ value }) {
  if (value == null || !Number.isFinite(value)) {
    return <TableCell align="right">—</TableCell>;
  }
  return (
    <TableCell
      align="right"
      className={`${styles.numericCell} ${surpriseClass(value)}`}
      sx={{ fontWeight: 600 }}
    >
      {fmtSurprisePercent(value)}
    </TableCell>
  );
}

export default function QuarterlyFundamentalsTable({
  quarterlyFundamentalsData,
  earnings,
}) {
  const [order, setOrder] = useState("desc");
  const orderBy = "date";

  const earningsMap = useMemo(() => buildEarningsMap(earnings), [earnings]);

  const handleSort = () => setOrder(order === "asc" ? "desc" : "asc");

  const sortedData = [...quarterlyFundamentalsData].sort((a, b) =>
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
              <Tooltip title="Total sales the company made this quarter" arrow>
                <span>Revenue</span>
              </Tooltip>
            </TableCell>
            <TableCell align="right">
              <Tooltip
                title="How much revenue grew vs. the previous quarter"
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
                title="How much profit grew vs. the previous quarter"
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
              <Tooltip title="Reported EPS (analyst basis)" arrow>
                <span>EPS</span>
              </Tooltip>
            </TableCell>
            <TableCell align="right">
              <Tooltip title="Analyst consensus EPS estimate before the report" arrow>
                <span>EPS Est</span>
              </Tooltip>
            </TableCell>
            <TableCell align="right">
              <Tooltip
                title="How much reported EPS beat or missed the estimate"
                arrow
              >
                <span>EPS Surprise</span>
              </Tooltip>
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {dataWithGrowth.map((row) => {
            const dateKey = row.date?.split("T")[0];
            const earningsDate = row.reportedDate ?? earningsMap[dateKey];
            const eps = row.epsActual ?? row.dilutedEPS;
            const earningsOnly =
              row.earningsOnly ||
              (Number.isFinite(eps) &&
                !Number.isFinite(row.totalRevenue) &&
                !Number.isFinite(row.netIncome));
            return (
              <TableRow key={row.date} hover>
                <TableCell>
                  <div>{new Date(row.date).toLocaleDateString()}</div>
                  {earningsDate && (
                    <div className={earningsStyles.reportedDate}>
                      Reported {formatEarningsDate(earningsDate)}
                    </div>
                  )}
                  {earningsOnly && (
                    <div className={earningsStyles.pendingNote}>
                      Full statements pending
                    </div>
                  )}
                </TableCell>
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
                  {fmtEpsCell(row.epsActual ?? row.dilutedEPS)}
                </TableCell>
                <TableCell align="right" className={styles.numericCell}>
                  {fmtEpsCell(row.epsEstimate)}
                </TableCell>
                <SurpriseCell value={row.surprisePercent} />
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
