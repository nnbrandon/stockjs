import { useEffect, useState } from "react";
import { Pagination, Box } from "@mui/material";
import styles from "./NewsList.module.css";

const PAGE_SIZE = 8;
const PAGE_SIZE_COMPACT = 6;

function formatDate(date) {
  return new Date(date).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function NewsItem({ item, compact }) {
  const thumb =
    item.thumbnail?.resolutions?.[1]?.url ||
    item.thumbnail?.resolutions?.[0]?.url;

  return (
    <a
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      className={`${styles.newsLink} ${compact ? styles.newsLinkCompact : ""}`}
    >
      <article className={compact ? styles.itemCompact : styles.item}>
        {thumb && (
          <img
            src={thumb}
            alt=""
            className={compact ? styles.thumbCompact : styles.thumb}
          />
        )}
        <div className={styles.body}>
          <h3 className={compact ? styles.titleCompact : styles.title}>
            {item.title}
          </h3>
          <p className={styles.meta}>
            {formatDate(item.date)} — {item.publisher || "Unknown"}
          </p>
          {!compact && (item.summary || item.description) && (
            <p className={styles.summary}>{item.summary || item.description}</p>
          )}
        </div>
      </article>
    </a>
  );
}

export default function NewsList({ news = [], compact = false }) {
  const [page, setPage] = useState(1);
  const pageSize = compact ? PAGE_SIZE_COMPACT : PAGE_SIZE;

  useEffect(() => {
    setPage(1);
  }, [news]);
  const pageCount = Math.ceil(news.length / pageSize);
  const paginatedNews = news.slice((page - 1) * pageSize, page * pageSize);

  if (!news.length) {
    return <p className={styles.empty}>No news cached for this symbol.</p>;
  }

  return (
    <div className={compact ? styles.listCompact : styles.list}>
      {paginatedNews.map((item, idx) => (
        <NewsItem key={item.id || idx} item={item} compact={compact} />
      ))}
      {pageCount > 1 && (
        <Box display="flex" justifyContent="center" mt="auto" pt={1.5}>
          <Pagination
            count={pageCount}
            page={page}
            onChange={(_, value) => setPage(value)}
            color="primary"
            size="small"
          />
        </Box>
      )}
    </div>
  );
}
