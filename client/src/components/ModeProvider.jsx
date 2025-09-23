import React, { createContext, useContext, useEffect, useState } from "react";

const ModeContext = createContext();

// eslint-disable-next-line react-refresh/only-export-components
export function useMode() {
  return useContext(ModeContext);
}

export function ModeProvider({ children }) {
  const [mode, setMode] = useState(() => {
    // Try to get mode from localStorage, default to "dark"
    return localStorage.getItem("themeMode") || "dark";
  });

  useEffect(() => {
    localStorage.setItem("themeMode", mode);
  }, [mode]);

  const toggleTheme = () => {
    setMode((prev) => (prev === "light" ? "dark" : "light"));
  };

  return (
    <ModeContext.Provider value={{ mode, setMode, toggleTheme }}>
      {children}
    </ModeContext.Provider>
  );
}
