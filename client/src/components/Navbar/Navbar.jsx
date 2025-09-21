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

import styles from "./Navbar.module.css";

function Navbar({
  mode,
  selectedSymbol,
  symbols,
  onCloseNav,
  onClickAddTickerModal,
  onClickSymbol,
  onRefreshAllTickers,
  toggleTheme,
  isRefreshingAll,
}) {
  const renderNavData = symbols.map((symbol, index) => {
    return (
      <ListItem key={index}>
        <ListItemButton
          selected={selectedSymbol === symbol}
          onClick={() => onClickSymbol(symbol)}
        >
          <ListItemText primary={symbol} />
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
            <Button
              variant="outlined"
              onClick={() => onRefreshAllTickers()}
              fullWidth
              style={{ marginTop: "0.5rem" }}
            >
              Refresh all tickers
            </Button>
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
