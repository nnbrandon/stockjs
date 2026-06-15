import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { Snackbar, Alert } from "@mui/material";
import RefreshProgressToast from "./RefreshProgressToast";

const SnackbarContext = createContext();
const RefreshProgressContext = createContext();

// eslint-disable-next-line react-refresh/only-export-components
export function useSnackbar() {
  return useContext(SnackbarContext);
}

/**
 * Controller for the "refresh all" progress toast. Returns:
 *   start(symbols) — open the toast with every symbol marked pending
 *   markDone(symbol) / markError(symbol) — update one symbol's status
 *   close() — dismiss the toast
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useRefreshProgress() {
  return useContext(RefreshProgressContext);
}

export function SnackbarProvider({ children }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [severity, setSeverity] = useState("success");

  const showSnackbar = (msg, sev = "success") => {
    setMessage(msg);
    setSeverity(sev);
    setOpen(true);
  };

  const handleClose = () => setOpen(false);

  // --- Refresh-all progress state ---
  const [progressOpen, setProgressOpen] = useState(false);
  const [symbols, setSymbols] = useState([]);
  const [statuses, setStatuses] = useState({});

  const start = useCallback((symbolList) => {
    setSymbols(symbolList);
    setStatuses(
      Object.fromEntries(symbolList.map((symbol) => [symbol, "pending"])),
    );
    setProgressOpen(true);
  }, []);

  const setStatus = useCallback((symbol, status) => {
    setStatuses((prev) => ({ ...prev, [symbol]: status }));
  }, []);

  const markDone = useCallback(
    (symbol) => setStatus(symbol, "done"),
    [setStatus],
  );
  const markError = useCallback(
    (symbol) => setStatus(symbol, "error"),
    [setStatus],
  );
  const closeProgress = useCallback(() => setProgressOpen(false), []);

  const progressController = useMemo(
    () => ({ start, markDone, markError, close: closeProgress }),
    [start, markDone, markError, closeProgress],
  );

  return (
    <SnackbarContext.Provider value={showSnackbar}>
      <RefreshProgressContext.Provider value={progressController}>
        {children}
        <Snackbar
          open={open}
          autoHideDuration={4000}
          onClose={handleClose}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
          <Alert
            onClose={handleClose}
            severity={severity}
            sx={{ width: "100%" }}
          >
            {message}
          </Alert>
        </Snackbar>
        <RefreshProgressToast
          open={progressOpen}
          symbols={symbols}
          statuses={statuses}
          onClose={closeProgress}
        />
      </RefreshProgressContext.Provider>
    </SnackbarContext.Provider>
  );
}
