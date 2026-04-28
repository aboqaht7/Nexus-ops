import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

interface TerminalPanelProps {
  botId: string;
  active: boolean;
}

export function TerminalPanel({ botId, active }: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current || mountedRef.current) return;
    mountedRef.current = true;

    const term = new Terminal({
      theme: {
        background: "#0c0c0e",
        foreground: "#d4d4d8",
        cursor: "#3b82f6",
        selectionBackground: "#3b82f640",
        black: "#1c1c1e",
        brightBlack: "#52525b",
        red: "#f87171",
        brightRed: "#ef4444",
        green: "#4ade80",
        brightGreen: "#22c55e",
        yellow: "#fbbf24",
        brightYellow: "#f59e0b",
        blue: "#60a5fa",
        brightBlue: "#3b82f6",
        magenta: "#c084fc",
        brightMagenta: "#a855f7",
        cyan: "#22d3ee",
        brightCyan: "#06b6d4",
        white: "#e4e4e7",
        brightWhite: "#fafafa",
      },
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: "block",
      scrollback: 5000,
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);

    requestAnimationFrame(() => {
      fitAddon.fit();
    });

    termRef.current = term;
    fitRef.current = fitAddon;

    // Connect WebSocket
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    const wsUrl = `${protocol}//${window.location.host}${base}/api/bots/${botId}/terminal`;

    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
      };

      ws.onmessage = (e) => {
        term.write(e.data);
      };

      ws.onerror = () => {
        term.write("\r\n\x1b[31m[Connection error — terminal unavailable]\x1b[0m\r\n");
      };

      ws.onclose = () => {
        term.write("\r\n\x1b[33m[Session ended]\x1b[0m\r\n");
      };
    } catch {
      term.write("\x1b[31m[WebSocket not supported]\x1b[0m\r\n");
    }

    // Forward keyboard input
    term.onData((data) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "input", data }));
      }
    });

    // Resize handler
    const handleResize = () => {
      fitAddon.fit();
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows })
        );
      }
    };
    const resizeObserver = new ResizeObserver(handleResize);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    window.addEventListener("resize", handleResize);

    return () => {
      wsRef.current?.close();
      term.dispose();
      resizeObserver.disconnect();
      window.removeEventListener("resize", handleResize);
      mountedRef.current = false;
    };
  }, [botId]);

  // Fit when tab becomes active
  useEffect(() => {
    if (active && fitRef.current) {
      requestAnimationFrame(() => fitRef.current?.fit());
    }
  }, [active]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{ padding: "4px" }}
    />
  );
}
