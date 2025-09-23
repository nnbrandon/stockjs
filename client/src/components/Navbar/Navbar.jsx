import CloseIcon from "@mui/icons-material/Close";
import Button from "@mui/material/Button";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import Tooltip from "@mui/material/Tooltip";

import styles from "./Navbar.module.css";
import isMarketOpen from "../../utils/isMarketOpen";

function Navbar({
  mode,
  selectedSymbol,
  storedSymbolsWithNames,
  onCloseNav,
  onClickAddTickerModal,
  onClickSymbol,
  onRefreshAllTickers,
  toggleTheme,
  isRefreshingAll,
}) {
  const renderNavData = storedSymbolsWithNames.map((symbolWithName, index) => {
    return (
      <ListItem key={index}>
        <ListItemButton
          selected={selectedSymbol === symbolWithName.symbol}
          onClick={() => onClickSymbol(symbolWithName.symbol)}
        >
          <ListItemText primary={symbolWithName.name} />
        </ListItemButton>
      </ListItem>
    );
  });

  return (
    <div className={styles.sidebar}>
      <span>
        <CloseIcon
          className={styles.closeButton}
          alt="Close"
          onClick={onCloseNav}
          fontSize="large"
        />
      </span>
      <Divider />
      <nav
        className={styles.nav}
        aria-label="navigation sidebar of ticker symbols"
      >
        <List>{renderNavData}</List>
      </nav>
      <Divider />
      <div className={styles.bottomNav}>
        <div className={styles.buttons}>
          <Button variant="outlined" onClick={onClickAddTickerModal} fullWidth>
            Add Ticker
          </Button>
          {!isRefreshingAll ? (
            <Tooltip
              title={
                isMarketOpen()
                  ? "Disabled while the market is open"
                  : storedSymbolsWithNames.length === 0
                    ? "No tickers to refresh"
                    : ""
              }
              disableHoverListener={
                !isMarketOpen() && storedSymbolsWithNames.length > 0
              }
            >
              <span>
                <Button
                  variant="outlined"
                  onClick={() => onRefreshAllTickers()}
                  fullWidth
                  disabled={
                    isMarketOpen() || storedSymbolsWithNames.length === 0
                  }
                  style={{ marginTop: "0.5rem" }}
                >
                  Refresh all tickers
                </Button>
              </span>
            </Tooltip>
          ) : (
            <Button
              variant="outlined"
              disabled
              fullWidth
              style={{ marginTop: "0.5rem" }}
            >
              Refreshing all tickers...
            </Button>
          )}
        </div>
        <div>
          {mode === "dark" && (
            <IconButton onClick={toggleTheme}>
              <LightModeIcon />
            </IconButton>
          )}
          {mode === "light" && (
            <IconButton onClick={toggleTheme}>
              <DarkModeIcon />
            </IconButton>
          )}
        </div>
      </div>
    </div>
  );
}

export default Navbar;
