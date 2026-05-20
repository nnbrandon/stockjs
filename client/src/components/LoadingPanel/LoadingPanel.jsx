import CircularProgress from "@mui/material/CircularProgress";
import styles from "./LoadingPanel.module.css";

function LoadingPanel({ loading, isEmpty, children }) {
  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <CircularProgress />
      </div>
    );
  }

  if (isEmpty) {
    return <div />;
  }

  return children;
}

export default LoadingPanel;
