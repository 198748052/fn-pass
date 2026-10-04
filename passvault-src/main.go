package main

import (
	"context"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"
)

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func firstExisting(candidates ...string) string {
	for _, c := range candidates {
		if c == "" {
			continue
		}
		if st, err := os.Stat(c); err == nil && st.IsDir() {
			return c
		}
	}
	return ""
}

func main() {
	var (
		addr    = flag.String("addr", "", "listen address, e.g. :9100")
		dataDir = flag.String("data", "", "directory for the encrypted vault")
		webDir  = flag.String("web", "", "directory containing the web UI")
	)
	flag.Parse()

	port := env("TRIM_SERVICE_PORT", env("PORT", "9100"))
	listen := *addr
	if listen == "" {
		listen = ":" + port
	}

	dir := *dataDir
	if dir == "" {
		dir = env("DATA_DIR", env("TRIM_PKGVAR", "./data"))
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		log.Fatalf("create data dir: %v", err)
	}

	web := *webDir
	if web == "" {
		web = env("WEB_DIR", "")
	}
	if web == "" {
		exe, _ := os.Executable()
		exeDir := ""
		if exe != "" {
			exeDir = filepath.Dir(exe)
		}
		web = firstExisting(
			filepath.Join(exeDir, "..", "www"),
			filepath.Join(exeDir, "www"),
			filepath.Join(dir, "www"),
			filepath.Join(env("TRIM_APPDEST", ""), "www"),
		)
	}

	app, err := NewApp(dir, web)
	if err != nil {
		log.Fatalf("init app: %v", err)
	}

	srv := &http.Server{
		Addr:              listen,
		Handler:           app.Routes(),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	go func() {
		log.Printf("PassVault %s starting on %s (data=%s web=%s)", env("TRIM_APPVER", "dev"), listen, dir, web)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("listen: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
	log.Println("PassVault stopped")
}
