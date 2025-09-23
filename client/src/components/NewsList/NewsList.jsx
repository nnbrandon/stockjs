import {
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Avatar,
  Typography,
  Divider,
  Pagination,
  Box,
} from "@mui/material";
import { useState } from "react";
import styles from "./NewsList.module.css"; // Create this CSS file

const PAGE_SIZE = 8;

export default function NewsList({ news }) {
  const [page, setPage] = useState(1);
  const pageCount = Math.ceil(news.length / PAGE_SIZE);
  const paginatedNews = news.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <List>
        {paginatedNews.map((item, idx) => (
          <div key={item.id || idx}>
            <a
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.newsLink}
            >
              <ListItem alignItems="flex-start" sx={{ borderRadius: 2, mb: 1 }}>
                <ListItemAvatar>
                  <Avatar
                    variant="square"
                    src={
                      item.thumbnail?.resolutions?.[1]?.url ||
                      "https://via.placeholder.com/80"
                    }
                    alt={item.title}
                    sx={{ width: 80, height: 60, mr: 2 }}
                  />
                </ListItemAvatar>
                <ListItemText
                  primary={item.title}
                  secondary={
                    <>
                      <Typography
                        component="span"
                        variant="body2"
                        color="text.primary"
                      >
                        {new Date(item.date).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        — {item.publisher || "Unknown"}
                      </Typography>
                      <br />
                      {item.summary || item.description || ""}
                    </>
                  }
                />
              </ListItem>
            </a>
            <Divider component="li" />
          </div>
        ))}
      </List>
      {pageCount > 1 && (
        <Box display="flex" justifyContent="center" mt={2}>
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
