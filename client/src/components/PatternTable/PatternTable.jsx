import { useState, Fragment } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Tooltip,
  Stack,
  Chip,
} from "@mui/material";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";

import styles from "./PatternTable.module.css";

const BULLISH_ENGULFING_DESCRIPTION =
  "A bullish engulfing pattern is a candlestick pattern that forms when a small red candlestick is followed the next day by a large green candlestick, the body of which completely overlaps or engulfs the body of the previous day's candlestick.";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function formatDate(value) {
  const date = new Date(value);
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

function PatternChip({ matched }) {
  return (
    <Chip
      label={matched ? "Yes" : "No"}
      size="small"
      sx={{
        height: 22,
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: "0.04em",
        backgroundColor: matched
          ? "var(--palette-success-soft)"
          : "var(--palette-bg-elevated)",
        color: matched
          ? "var(--palette-success)"
          : "var(--palette-text-secondary)",
        border: matched
          ? "1px solid var(--palette-success)"
          : "1px solid var(--palette-divider)",
        borderRadius: "999px",
      }}
    />
  );
}

function PatternHeader({ label, description }) {
  return (
    <Stack direction="row" alignItems="center" spacing={0.75}>
      <span>{label}</span>
      <Tooltip title={description} placement="top" arrow>
        <HelpOutlineIcon
          fontSize="inherit"
          className={styles.helpIcon}
          aria-label={`About ${label}`}
        />
      </Tooltip>
    </Stack>
  );
}

export default function PatternTable({ patternsData }) {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const handleChangePage = (_event, newPage) => setPage(newPage);

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const pagedData = patternsData.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage,
  );

  return (
    <Fragment>
      <TableContainer>
        <Table aria-label="Pattern table" size="small">
          <TableHead>
            <TableRow>
              <TableCell>Date</TableCell>
              <TableCell align="right">Price (USD)</TableCell>
              <TableCell align="right">Volume</TableCell>
              <TableCell>
                <PatternHeader
                  label="Bullish Engulfing"
                  description={BULLISH_ENGULFING_DESCRIPTION}
                />
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {pagedData.map((pattern) => (
              <TableRow key={pattern.date} hover>
                <TableCell>{formatDate(pattern.date)}</TableCell>
                <TableCell align="right" className={styles.numericCell}>
                  {pattern.close.toFixed(2)}
                </TableCell>
                <TableCell align="right" className={styles.numericCell}>
                  {pattern.volume.toLocaleString()}
                </TableCell>
                <TableCell>
                  <PatternChip matched={pattern.isBullishEngulfing} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        rowsPerPageOptions={[10, 25, 50]}
        component="div"
        count={patternsData.length}
        rowsPerPage={rowsPerPage}
        page={page}
        onPageChange={handleChangePage}
        onRowsPerPageChange={handleChangeRowsPerPage}
      />
    </Fragment>
  );
}
